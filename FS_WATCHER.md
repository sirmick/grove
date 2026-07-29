# File-System Watcher Plan

## Goal

Grove should notice external edits to a space's source tree and refresh the app automatically.

Expected behavior:

- Watch the space source tree up to a sensible size.
- Ignore generated and noisy directories.
- Rebuild derived `db/*` after external edits.
- Broadcast a change event to connected clients.
- Refresh the tree when files are added, removed, renamed, or when collection metadata changes.
- Refresh open document/collection tabs after edited files change.
- Close or mark open tabs whose backing files are deleted.
- Avoid rebuild loops from Grove's own generated `db/*` writes.

This watcher is different from the current `watchSpace()` helper. The current watcher watches only
`db/respins.json` as a low-cost "a respin happened" marker. The new watcher should watch source
files and trigger the respin.

## Current State

Existing watcher:

- `watchSpace(spaceDir, onBuild)` in `packages/core/src/node.ts`.
- Watches only `<space>/db/respins.json`.
- Does not rebuild.
- Reads `db/meta.json` and calls `onBuild(meta)`.
- Used by the server after `ensure(name)` builds a space.
- Used by `grove watch`.

Server write paths:

- `/incoming/*` writes a source file, commits, runs `buildSpace(dir)`, then broadcasts.
- `/commit` applies a worktree transaction, merges, rebuilds, then broadcasts.

Frontend refresh path:

- `/events` emits `changed`.
- `sync.svelte.ts` receives the event and calls `reconcile()`.
- `reconcile()` compares `db/meta.json`.
- If `builtAt` changed, `applyReload()` calls `loadCorpus()`, invalidates search, and closes open
  doc tabs for records that no longer exist.
- The tree is derived from the loaded corpus, so loading corpus refreshes the tree.

The frontend already has most of the refresh behavior needed. The missing piece is a server-side
source-tree watcher that rebuilds and broadcasts when edits happen outside Grove.

## Watch Scope

Watch source files that can affect the corpus or projections:

- `**/*.md`
- `**/*.yaml`
- `**/*.yml`

Ignore:

- `db/**`
- `.git/**`
- `node_modules/**`
- `.DS_Store`
- editor temp/swap files
- `*.tmp`
- hidden cache/build directories

Recommended temp-file ignores:

- `**/*~`
- `**/*.swp`
- `**/*.swo`
- `**/.#*`
- `**/#*#`
- `**/*.tmp`

## Sensible Size Limit

Recursive watchers can exhaust OS limits on large spaces. Add a preflight scan before enabling the
source watcher.

Recommended defaults:

- `GROVE_FS_WATCH=1` enables source-tree watching.
- `GROVE_FS_WATCH_MAX_FILES=5000` default file cap.
- `GROVE_FS_WATCH_MAX_DEPTH=12` default traversal cap.
- `GROVE_FS_WATCH_POLL=1` optional polling fallback for network filesystems.

Preflight should count only candidate source files plus collection metadata files, not ignored dirs.

Behavior when over limit:

- Do not start the source watcher.
- Log a clear warning with count and configured limit.
- Keep the existing `db/respins.json` marker watcher active.
- The app still refreshes after Grove writes and explicit builds.

This keeps the feature useful for normal spaces without making large repos fragile.

## Server Design

Add a new helper beside `watchSpace()`:

```ts
interface WatchSourceOptions {
  maxFiles: number
  maxDepth: number
  usePolling: boolean
}

interface SourceChange {
  paths: string[]
  reason: 'add' | 'change' | 'unlink' | 'mixed'
}

function watchSourceTree(
  spaceDir: string,
  onChange: (change: SourceChange) => void,
  options: WatchSourceOptions,
): { close(): Promise<void> | void } | null
```

Implementation notes:

- Use `chokidar`.
- Watch the space root recursively, but with ignored dirs and file patterns.
- Debounce changes before rebuilding.
- Coalesce multiple events into one change set.
- Normalize paths to space-relative paths.
- Ignore writes under `db/`.
- Ignore `.git/`.
- If the preflight scan exceeds `maxFiles`, return `null` and log.

Recommended debounce:

- 150-300ms for ordinary edits.
- If events keep arriving, cap the wait at around 1000ms so saves from editors that write temp files
  settle without delaying forever.

## Rebuild Flow

When source changes are observed:

1. Coalesce changed paths.
2. Run `buildSpace(spaceDir)`.
3. Broadcast the resulting meta on `/events`.
4. Let clients call `loadCorpus()` and refresh derived UI.

Do not auto-commit external edits. The watcher should reflect disk state, not create commits. Git
status can be surfaced later if needed.

Do not call both the source watcher broadcast and the existing respin-marker watcher broadcast for
the same rebuild if it causes duplicate events. Duplicate SSE events are safe because the frontend
compares `builtAt`, but avoid unnecessary noise if practical.

Pragmatic first pass:

- Keep both watchers.
- Source watcher rebuilds and broadcasts inline.
- Existing `db/respins.json` watcher may emit a second event.
- Frontend `reconcile()` ignores the duplicate because `builtAt` is unchanged after the first reload.

Cleaner later pass:

- Split the existing helper into `watchRespinMarker()` and `watchSourceTree()`.
- The server can choose one broadcast path per rebuild.

## Integration in Server

Current `ensure(name)` does:

```ts
buildSpace(dir)
watchSpace(dir, (m) => broadcast(name, m))
built.add(name)
```

Target shape:

```ts
buildSpace(dir)
watchSpace(dir, (m) => broadcast(name, m))
watchSourceTreeIfEnabled(dir, () => {
  const meta = buildSpace(dir)
  broadcast(name, meta)
})
built.add(name)
```

Track watcher handles per space, not just a `built` set, so the server can close them on shutdown or
if a space is removed later.

Suggested state:

```ts
interface SpaceRuntime {
  dir: string
  respinWatcher: WatcherHandle
  sourceWatcher?: WatcherHandle
}

const spaces = new Map<string, SpaceRuntime>()
```

This aligns with future multi-space runtime work.

## App Refresh Behavior

The current frontend already refreshes the main pieces through `reconcile()`:

- `loadCorpus()` refreshes canonical files.
- Tree derives from `grove.collections.tree()`, so it updates after corpus reload.
- Search is invalidated.
- Deleted doc tabs are closed if the slug no longer exists.

Enhancements needed for a better external-edit UX:

- If the active doc still exists and has no local draft, it should visibly update after corpus reload.
- If the active doc has a local draft, keep the draft overlay and show a conflict/stale-base warning
  later. Do not overwrite drafts automatically.
- If a collection's `_grove/schema.yaml` or `_grove/overview.md` changes, collection tabs should
  rerender after reload.
- If a file is deleted and a tab is open, current close behavior is acceptable for first pass.
- If a file is renamed, first pass can treat it as delete + add.

The main requirement, "auto-refresh open tabs and the tree on edit", can be satisfied by the current
corpus reload path as long as source watcher rebuilds and broadcasts reliably.

## Event Payload

Current event payload includes:

```json
{
  "builtAt": "...",
  "headCommit": "...",
  "status": "ok"
}
```

For first pass, this is enough. The client reloads corpus and recalculates.

Later, add changed paths:

```json
{
  "builtAt": "...",
  "headCommit": "...",
  "status": "ok",
  "source": "fs",
  "paths": ["notes/foo.md", "notes/_grove/schema.yaml"]
}
```

Changed paths would let the UI show better messages and avoid some reload work, but the simple full
corpus reload is safer and already matches Grove's current engine design.

## CLI Behavior

`grove watch` currently watches only `db/respins.json`, so it does not do what its description says:
"rebuild db/ on any change to the space".

Update the CLI command as part of this work:

- `grove watch` should use the new source-tree watcher.
- On source change, run `buildSpace(spaceDir)`.
- Print changed paths and respin status.
- Keep the size-limit behavior.

Optional:

- Add `grove watch --marker` for the old marker-only behavior if still useful.

## Tests

Core/server tests:

- Preflight counts candidate files and ignores `db/`, `.git/`, `node_modules/`.
- Watcher refuses to start above `maxFiles`.
- Editing a markdown file triggers one rebuild after debounce.
- Editing `db/meta.json` or `db/respins.json` does not trigger a source rebuild loop.
- Deleting a markdown file triggers rebuild.
- Adding `_grove/schema.yaml` triggers rebuild.

Playwright:

1. Open a doc.
2. Write directly to that doc on disk outside `/commit` and `/incoming`.
3. Wait for the page body to update.
4. Add a new markdown record on disk.
5. Wait for the tree to show the new node.
6. Delete that file.
7. Wait for the tree to remove the node.
8. Open a doc with a local draft, change canonical disk file externally, confirm draft remains.

The e2e harness already copies `spaces/demo` into `test-space`, so tests can safely mutate files
there.

## Failure Handling

If `buildSpace()` fails after an external edit:

- Write a failed respin record as today.
- Broadcast status `fail`.
- Frontend should show existing sync error behavior.
- Keep serving the last successful corpus/db until the source is fixed and a successful rebuild runs.

If the watcher errors:

- Log the exact chokidar error.
- Keep the server running.
- Continue supporting manual reloads and Grove write paths.

If events are missed:

- The existing 60-second `reconcile()` polling still catches a changed `db/meta.json` after a build.
- For external source edits, missing the source watcher means no build happens; users need explicit
  `grove build run` or `grove watch` until watcher recovers.

## Implementation Phases

### Phase 1: Source Watcher Helper

- Add candidate-file preflight.
- Add ignored path rules.
- Add debounced `watchSourceTree()`.
- Keep it disabled by default behind `GROVE_FS_WATCH=1` while testing.

### Phase 2: Server Integration

- Start source watcher in `ensure(name)` when enabled and below limit.
- Rebuild and broadcast on source changes.
- Track watcher handles per space.
- Close watchers on server shutdown.

### Phase 3: CLI Watch Fix

- Change `grove watch` to use source watcher.
- Keep marker watcher behavior only if explicitly requested.

### Phase 4: Frontend Polish

- Add a small non-intrusive sync status for external refreshes.
- Improve deleted-tab behavior if closing tabs feels abrupt.
- Add stale-draft warning for local draft over changed canonical file.

### Phase 5: Enable by Default

- After tests and soak, enable source watching by default for spaces under the file cap.
- Allow `GROVE_FS_WATCH=0` to disable it.

## Open Decisions

- Default enabled or opt-in for the first release?
- Exact default file cap: 3000, 5000, or 10000?
- Should external edits trigger git status display or remain purely live-refresh?
- Should failed external builds keep old tree or show partial source state? Recommendation: keep old
  successful tree and surface the build error.
