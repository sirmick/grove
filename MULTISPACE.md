# Multi-Space Plan

## Goal

Grove should support real multi-space work inside one browser session.

The expected UX is:

- The app has one active space at a time.
- Switching spaces does not reload the page.
- The main tree/content state changes to the selected space.
- The terminal area at the bottom has tabs.
- Terminal tabs are scoped by space: switching spaces shows only that space's terminal tabs.
- Each terminal tab owns one persistent shell session for its space.
- Drafts, sync status, open content tabs, search results, and terminal tabs do not leak across spaces.

This is more than terminal tabs. Terminal tabs are the visible first step, but true multi-space means
space identity must become explicit in app state and server calls instead of being inferred only from
the `grove_space` cookie.

## Current State

Server:

- Space selection is currently resolved from the `grove_space` cookie via `reqSpace()`.
- `/spaces` lists selectable spaces and the current cookie/default space.
- `/corpus.json`, `/db/*`, `/events`, `/commit`, `/exec`, and `/pty` all resolve the space from the
  request cookie.
- PTY sessions are already keyed by `dir + sid`, which is close to the shape needed for multiple
  terminals per space.

Frontend:

- `space.svelte.ts` treats switching spaces as `set cookie + location.reload()`.
- `corpusState`, `draftsState`, `syncState`, search state, and open content tabs are singletons.
- Draft persistence is scoped by current space name, but only because switching reloads and the
  current space is fixed for the session.
- `Terminal.svelte` owns a single xterm instance and connects to `/pty?sid=<id>`.

The cookie model is workable for one active space and one page load. It is the main blocker for
multi-space operation because concurrent state cannot safely rely on one global mutable cookie.

## Target Model

Introduce explicit space identity everywhere that can touch space data.

Use a stable space name as the frontend key. The server should continue validating names against
`listSpaces()` before resolving directories.

Recommended server API shape:

- `GET /spaces`
- `GET /corpus.json?space=<name>`
- `GET /db/<file>?space=<name>`
- `GET /events?space=<name>`
- `POST /commit?space=<name>`
- `POST /exec?space=<name>`
- `WS /pty?space=<name>&sid=<terminal-tab-id>`

Keep the cookie as a compatibility fallback during migration:

1. If `space` query param is present, validate and use it.
2. Else use the existing cookie/default behavior.

This keeps older links and single-space flows working while the app moves to explicit space calls.

## Frontend State Shape

Add a `SpaceRuntime` concept and make current singleton state space-indexed.

Suggested shape:

```ts
interface SpaceRuntime {
  name: string
  corpus: Corpus
  drafts: Record<string, Draft>
  sync: {
    status: SyncStatus
    message: string
    builtAt: string
    headCommit: string
  }
  contentTabs: Tab[]
  activeContentTabId: string | null
  terminalTabs: TerminalTab[]
  activeTerminalTabId: string | null
}

interface TerminalTab {
  id: string
  title: string
  createdAt: number
}
```

The app-level state becomes:

```ts
interface SpacesState {
  spaces: string[]
  active: string
  runtimes: Record<string, SpaceRuntime>
}
```

Accessors should take `space` explicitly or derive it from `spacesState.active` at the boundary:

- `loadCorpus(space)`
- `loadDrafts(space)`
- `commitAll(space)`
- `reconcile(space)`
- `groveFor(space)` or `withSpace(space).collections.tree()`
- `openCollection(space, path)`
- `openRecord(space, slug)`

Avoid a global `grove` client that silently reads one global corpus. The current proxy is convenient,
but it should either become space-aware or be recreated per runtime.

## Space Switching UX

Switching spaces should:

1. Set `spacesState.active`.
2. Ensure that space runtime is initialized.
3. Load that space's drafts, corpus, and initial meta if not loaded.
4. Subscribe to that space's event stream if not already subscribed.
5. Render that space's tree and active content tab.
6. Render that space's terminal tabs in the bottom pane.

It should not:

- Reload the page.
- Close terminal tabs from other spaces.
- Clear drafts from any space.
- Reuse content tabs across spaces unless they are explicitly tagged by space.

The current space selector in `Chrome.svelte` can remain the control surface, but `switchSpace()` must
become an in-memory state transition rather than `location.reload()`.

## Bottom Terminal Tabs

Add a terminal tab strip inside the bottom pane.

Expected behavior:

- Each space has its own list of terminal tabs.
- Switching spaces swaps the visible terminal tab list.
- If a space has no terminal tabs, create one lazily when the terminal pane is opened or when the user
  clicks the new-tab button.
- Closing a terminal tab closes only the browser view by default. Decide separately whether to kill
  the backing PTY immediately or keep the current idle cleanup behavior.
- A terminal tab's PTY session key is `space + tab.id`.
- Terminal tab ids should be per-space stable IDs stored in app state, not generated inside
  `Terminal.svelte`.

Component split:

- `TerminalTabs.svelte`: tab strip, new/close/select controls.
- `Terminal.svelte`: one xterm bound to `{ space, sid }`.
- `TerminalPane.svelte`: owns visible tab selection for the active space and renders `Terminal`.

Protocol:

- Connect to `/pty?space=<space>&sid=<tab.id>`.
- Reuse the existing replay/live framing added for reconnect stability.
- Keep one visible xterm instance for the active terminal tab. When switching terminal tabs, unmount
  the old `Terminal` component and mount the new one; the server-side PTY session preserves shell
  state and scrollback.

Potential later polish:

- Rename tabs.
- Mark tabs with running command/activity state.
- Set default title from cwd or shell title escape sequences.
- Keyboard shortcuts for next/previous terminal tab.

## Sync and Events

Current `startSync()` starts one global event stream and one global interval.

Multi-space needs one sync controller per initialized space:

- `startSync(space)` opens `/events?space=<space>`.
- The event payload may remain unchanged because the stream is already scoped by query param.
- `reconcile(space)` compares only that runtime's meta.
- `applyReload(space)` reloads only that runtime's corpus/search data and only closes missing doc
  tabs for that space.
- Visibility and polling should reconcile initialized spaces, or just the active space plus any
  spaces with drafts.

Initial implementation can subscribe only to the active space and resubscribe on switch. Better
implementation keeps per-space streams alive for initialized spaces so background spaces stay fresh.

## Drafts and Commit

Drafts are already persisted with `drafts-<space>.json`, which is the right storage shape.

Changes needed:

- `loadDrafts(space)` reads `drafts-<space>.json` into that runtime.
- `setDraft(space, path, content, baseCommit)` writes that runtime's draft map.
- `commitAll(space)` posts to `/commit?space=<space>` and clears only that space's drafts after
  success.
- The Save button should reflect the active space's draft count.

Do not use one global `draftsState.map`; identical paths across spaces must be independent in memory
as well as on disk.

## Main Content Tabs

True multi-space should also scope the main content tabs.

Options:

1. Per-space content tabs:
   - Each space has its own tab list and active tab.
   - Switching spaces shows that space's previously open docs/collections.
   - This matches the requested terminal behavior and is simplest for users.

2. Global content tabs tagged with space:
   - Tabs can show records from multiple spaces in one strip.
   - More powerful, but higher UI complexity and easier to confuse.

Recommendation: use per-space content tabs first.

The existing `tabsState` should move into `SpaceRuntime`. Helpers like `openCollection()` and
`openRecord()` should operate on the active runtime or accept `space` explicitly.

## Server Changes

Add a helper:

```ts
function reqSpaceFromRequest(req: IncomingMessage | RequestLike): { name: string; dir: string }
```

Resolution order:

1. `space` query parameter.
2. `grove_space` cookie.
3. default space.

For Hono routes, use the request URL query param. For WebSocket upgrades, parse `req.url`.

Important constraints:

- Validate `space` against `listSpaces()`.
- Do not accept arbitrary paths from the client.
- Keep existing cookie behavior as fallback.
- Keep `ensure(name)` lazy build/watch behavior.
- PTY session key should remain `dir + sid`; because `dir` comes from the validated space, this is
  already enough.

## Implementation Phases

### Phase 1: Explicit Space Param on Server

- Add query-param resolution to the server routes.
- Keep cookie fallback.
- Add tests for `/corpus.json?space=<name>` and `/pty?space=<name>&sid=<id>`.
- No major UI changes yet.

### Phase 2: Terminal Tabs Per Space

- Add terminal tab state by space.
- Add bottom tab strip.
- Pass `{ space, sid }` into `Terminal.svelte`.
- Connect with explicit `/pty?space=...&sid=...`.
- Switching spaces swaps visible terminal tabs.
- Add e2e coverage for two spaces, each with separate terminal tabs and shell state.

### Phase 3: Space Runtime for Corpus, Drafts, Sync, Search

- Convert corpus, drafts, sync, and search caches into per-space runtime state.
- Replace cookie reload switching with active-space switching.
- Make Save and sync status active-space aware.
- Add e2e coverage that edits/drafts in one space do not appear in another.

### Phase 4: Per-Space Main Content Tabs

- Move `tabsState` into `SpaceRuntime`.
- Switching spaces restores that space's content tabs.
- Add e2e coverage for open docs/collections per space.

### Phase 5: Cleanup

- Remove cookie dependency from frontend reads/writes.
- Keep cookie only for default selected space on first load if useful.
- Audit all fetches and WebSocket connections for explicit space handling.
- Update docs and screenshots.

## Test Plan

Unit or lightweight integration:

- Server resolves explicit `space` before cookie.
- Unknown space returns a clear 400/404 rather than falling back silently.
- PTY session keys differ for same `sid` in different spaces.
- Draft persistence loads and saves by space.

Playwright:

- Open app, create terminal tab in space A, run `pwd`.
- Switch to space B, confirm space A terminal tab is hidden.
- Create terminal tab in space B, run `pwd`, confirm output differs.
- Switch back to space A, confirm original tab and output return.
- Open document tabs in two spaces and confirm switching restores the correct tab strip.
- Create a draft in space A, switch to space B, confirm Save count and content are not polluted.
- Commit in space A and confirm only space A sync/drafts update.

Regression tests to keep:

- Terminal reconnect does not duplicate scrollback replay.
- Multiple browser tabs do not fight over one terminal session.

## Risks

- Singleton state is the biggest risk. Migrating piecemeal can create bugs where UI reads active
  space state but writes global state.
- Event streams can multiply if lifecycle cleanup is sloppy. Track per-space subscriptions and close
  them when a runtime is discarded.
- Cookie fallback can hide missing `space` params. During migration, add logging or development
  assertions around frontend calls that still omit explicit space.
- Terminal tabs preserve PTYs server-side; many tabs across many spaces can accumulate shells. Keep
  idle cleanup and consider an explicit kill-on-close option.

## Open Decisions

- Should closing a terminal tab kill the PTY immediately, or keep it resumable until idle cleanup?
- Should content tabs be strictly per-space, or should the app eventually support mixed-space content
  tabs?
- Should background spaces keep live SSE subscriptions, or reconcile only on switch/focus?
- Should the URL encode active space and active content tab for shareable links?
