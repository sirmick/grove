# Grove deep review — findings

Scope: correctness bugs across the whole codebase, with emphasis on the WYSIWYG editor and the
save/commit flow. Findings marked **[reproduced]** were triggered live in a browser against an
isolated copy of `spaces/demo`; the rest were verified by reading the code (and, for the query/CLI
ones, by running read-only CLI commands).

Severity: **HIGH** = data loss, corruption, security, or a dead-end for the user. **MEDIUM** =
wrong behavior in a common path. **LOW** = narrow/cosmetic.

Status legend: ☐ not started · ◐ in progress · ☑ fixed on `review-fixes`.

---

## A. WYSIWYG editor — document corruption

**A1 [reproduced] · HIGH · ◐** — Wikilinks are destroyed by any Document-mode edit.
`packages/app/src/lib/editor/Wysiwyg.svelte`. Opening `notes/welcome.md` (contains
`[[capitals/tokyo]]`), typing one word, and saving rewrites every wikilink on disk as
`\[\[capitals/tokyo\]\]`. TipTap's markdown serializer escapes the brackets; because the text is now
escaped, the server's `normalizeWikilinksToMarkdown` can't match it either, so all link edges
(backlinks, graph, Obsidian export) for that doc are lost. Document mode is the default for note
collections.

**A2 [reproduced] · HIGH · ◐** — Bold-label field lines collapse into one line.
Editing `capitals/seoul.md` in Document mode turns four `**Field:** value` lines (separated by single
newlines = one markdown paragraph) into one line: `**Country:** South Korea **Population:** …`. The
extractor (`parse.ts` `FIELD_RE`, line-anchored) then reads only the first field, whose value
swallows the rest — the record's typed columns vanish from queries/tables.

**A3 [reproduced offline] · HIGH · ◐** — `proseOf` deletes content inside code fences.
`packages/core/src/edit.ts:50`. It drops every line matching `^#\s` or `^\*\*X:\*\*` with no
code-fence awareness. A `# install deps` comment inside a ```` ```bash ```` block and a legitimate
`**Note:** restart the server.` prose line are both deleted on any Form-mode save, and hidden by
DocView even without editing. The same fence-blindness affects `extractFields`, `titleOf`, and
`normalizeWikilinksToMarkdown` — the last rewrites wikilinks inside code examples *in the source
files* on every commit (`node.ts:391` → `prepareCommit`).

**A4 · HIGH · ◐** — Form mode drops fields not declared in the schema.
A `**Priority:** high` line on a record whose schema lacks `priority` is deleted on Form-mode save:
`extractFields` ignores it, `proseOf` strips it, `composeMarkdown` never re-emits it.

---

## B. Save / commit flow

**B1 [reproduced] · HIGH · ☐** — Concurrent edits are silently clobbered; conflict detection can
never fire. While the UI held a draft of `welcome.md`, an external edit landed via `/incoming`
(exactly how an AI/terminal edit arrives). UI Save succeeded and the external edit was gone. Drafts
record a `baseCommit` (`db/drafts.svelte.ts`) but `commitAll` never sends it
(`db/sync.svelte.ts:76-79`), and `beginChange` branches from *current* HEAD (`node.ts:667`), so the
worktree merge is always a fast-forward — the "validate-before-merge conflict detection" is
structurally unreachable for UI commits. Whole-file last-writer-wins, no warning.

**B2 [reproduced] · HIGH · ☐** — After a failed commit, Save is dead until reload. Breaking the
build gate and hitting Save gives a 409, status "Error", drafts kept — and `Save (1)` stays
**disabled forever** (gated on `syncState.status === 'idle'`; nothing resets `error`→`idle` unless
an unrelated respin bumps `builtAt`). The error text says "reload and retry" but the retry button is
unclickable. Same trap for the `respin.status === 'fail'` path in `reconcile`.

**B3 · HIGH · ☐** — Keystrokes typed during an in-flight commit are cleared. `commitAll` snapshots
the drafts, then on success calls `clearAllDrafts()`, wiping any draft written after the snapshot.
Should clear only the snapshotted paths whose `updatedAt` is unchanged.

**B4 [reproduced] · HIGH · ☐** — Clicking Edit on a stale "Not found" tab crashes.
`editor/RecordEditor.svelte:14` casts `grove.records.read(slug)` to `RecordDetail` without a null
check; a restored tab for a deleted record throws `Cannot read properties of undefined (reading
'body')` on Edit. TabBar still offers the Edit button for a missing record.

**B5 · MEDIUM · ☐** — Commit UX gaps (this is the "missing commit button" instinct). The blue
`Save (n)` button exists, but: no list/diff of pending files, no commit-message field, **no
discard/revert** (once the WYSIWYG mangles a doc, the only options are commit-the-damage or clear
browser storage), terminology drift ("Save" vs "Commit" vs MetaEditor's "Commit in the top bar"),
and the New dropdown doesn't close after a pick.

---

## C. Security

**C1 · HIGH · ☐** — Stored XSS escalating to shell execution. `packages/app/src/lib/md.ts:97`:
raw HTML in any markdown passes unsanitized through `renderMarkdown` into `{@html}` (DocView,
CollectionPage, LinksView, ProjectPage, HelpPanel). A record with
`<img src=x onerror="fetch('/exec',{method:'POST',...})">` runs same-origin JS in a session
authorized for `/exec` and `/pty` — viewing a doc can run commands on the host. Needs a sanitizer
(DOMPurify) or marked's raw-HTML disabled.

**C2 · HIGH · ☐** — `/move` accepts arbitrary `dest` and `item.id`. `server/index.ts:275-285`.
`moveTarget` only `existsSync`-checks dest; no `isDirectory()` / collection check. dest=`db` →
record renamed into gitignored `db/`, vanishes from tracking and corpus; dest=`_grove` → excluded
from tree/queries; dest=a plain file → `mkdirSync` throws ENOTDIR → 500. `item.id` is unvalidated:
`{type:'collection', id:'.git'}` relocates the space's git repo (history orphaned); `id='db'`/
`id='_grove'` are movable too.

**C3 · HIGH · ☐** — `/move` is non-atomic. `server/index.ts:294-304`: all items validated, then
mutated in a loop; a later `renameSync` failure (or TOCTOU) leaves earlier renames applied with no
commit/rebuild — dirty uncommitted space, stale db/, no SSE ping.

**C4 · HIGH · ☐** — `/upload` and `/incoming` silently overwrite existing records/assets and can
target `_grove/schema.yaml`, `db/*.json`, `.git/*.md`. `server/index.ts:313-332` (`safeUploadTarget`
has no existence guard, unlike `/move`), `215-237` (`safeTarget` admits `_grove` + `.git`). Dropping
`notes.md` onto a collection that has a record `notes` replaces its content with no warning.

**C5 · HIGH · ☐** — Schema fields collide with built-in row keys. `read.ts:63-70` spreads extracted
fields *after* built-ins: `{ slug, title, path, status, lastEdited, ...fields }`. A record with
`**Path:** ../../etc/passwd` / `**Status:** hacked` poisons `recordHref`, `statSync(join(dir,
row.path))` (`node.ts:538`, stats outside the space), db JSON, and the `Status` union.

---

## D. Query engine (`packages/core/src/query.ts`)

**D1 · HIGH · ◐** — Mixed string/number comparison falls back to lexicographic. `cmp` (`:67-72`)
only compares numerically when *both* sides are JS numbers. A string-typed `population:'37400000'`
with `where population>5000000` is excluded (`'37400000'.localeCompare('5000000') < 0`), and sort
over a mixed column is non-transitive/incoherent.

**D2 · HIGH · ◐** — Rows missing a field match every `<`/`<=` filter. `cmp(undefined, x) === -1`.
A typo'd field name (`bogus<5`) returns the *entire* collection (verified via CLI: 13/13 demo
cities). Same rows also sort first ascending, crowding out real data.

**D3 · MEDIUM · ◐** — `and` inside a filter value is unparseable. `parseWhere` splits on
`/\s+and\s+/i` before quote handling, so `title~"rock and roll"` throws `bad filter: "roll"`.

**D4 · MEDIUM · ◐** — Empty `number` field coerces to `0` (empty `integer` to `''`). `parse.ts:32`:
`Number('') === 0`, so a blank `**Price:**` becomes `price:0`, polluting sum/avg/min and matching
`price=0`/`price<x`.

**D5 · MEDIUM · ◐** — Unknown aggregate function silently vanishes. `query.ts:56-64` casts `fn as
AggFn` unchecked; `agg bogus:x` → `{}` with exit 0.

**D6 · LOW · ☐** — Quoted query values still coerce to numbers (`name="42"` → number 42); no way to
force string semantics. **D7 · LOW · ☐** — where/sort field names can't contain hyphens
(`market-cap>5` throws). **D8 · LOW · ☐** — `groupBy` on a field-less row groups under
`key: undefined` (serializes with no `key`).

---

## E. Client state, sync, rendering (`packages/app`)

**E1 · HIGH · ☐** — Search index is permanently stale. `db/search.svelte.ts:6-33`:
`invalidateSearch()` only nulls the in-memory index; the next search re-reads the OPFS file
`search-fixtures-1.json` (fixed version tag, written once) and `opfs.ts` has no delete API and
nothing rewrites it. New records are unfindable forever. Aggravators: the cache key is **not
space-scoped** (after switching spaces, search returns the other space's records); a first search
run offline caches the bundled-fallback snapshot permanently.

**E2 · MEDIUM · ☐** — Drafts for records moved/deleted by another client resurrect the old file.
`applyReload` (`sync.svelte.ts:40-50`) reconciles tabs but never reconciles draft paths against the
new corpus; `refile.ts` only re-keys drafts for moves initiated in *this* tab. A record edited here
then moved elsewhere by a terminal/second browser leaves a phantom draft that Commit recreates with
stale content.

**E3 · MEDIUM · ☐** — Any open README tab is force-closed on every respin.
`sync.svelte.ts:44-47` closes doc tabs whose ref isn't in `grove.search.slugs()`, but
`allRecordSlugs` excludes `README.md` while LinksView deliberately opens README.

**E4 · MEDIUM · ☐** — `[see](other.md#anchor)` opens the raw asset instead of the record.
`md.ts:66` tests the raw href (`/\.(md)$/i.test('other.md#sec')` is false) before the anchor is
stripped, so it falls to the asset branch.

**E5 · MEDIUM · ☐** — `[[wikilinks]]` inside code blocks render as literal anchor-tag soup.
`md.ts:86-97` `rewriteWikilinks` runs on the raw source before marked parses, so occurrences inside
fenced/inline code become escaped `<a class="wikilink" …>` text.

**E6 · MEDIUM · ☐** — Refile/SSE race can close a moved doc's tab instead of retargeting it. The
server broadcasts `changed` before the `/move` response returns (`server/index.ts:300-306`), so a
slow client can run `applyReload` before the fetch continuation and close the tab; `retargetTab`
then no-ops.

**E7 · MEDIUM · ☐** — Bin "refresh" affordance does nothing. `bin/BinTree.svelte:48-54`: the
`refresh-cw` icon lives inside the header button whose only handler toggles `open`; nothing calls
`loadBin()` from a user action. A failed initial `loadBin()` shows "loading…" forever (error
swallowed in `bin.svelte.ts:24-26`).

**E8 · LOW · ☐** — Collection overviews resolve relative links against the wrong base
(`CollectionPage.svelte:49` passes no `baseSlug`, but the overview lives at `<path>/_grove/`).
**E9 · LOW · ☐** — HelpPanel links are dead (no click interceptor) and Esc doesn't close it.
**E10 · LOW · ☐** — Tabs for records deleted while the app was closed linger until the next respin
(`loadTabs` does no existence check; the first `reconcile` returns early before tab cleanup).
**E11 · LOW · ☐** — LogView remounts its DataTable (losing the typed query) on every journal row via
`{#key rows.length}`; the fetch effect has no out-of-order guard. **E12 · LOW · ☐** — Link labels
lose inline formatting (`md.ts:68` emits `escapeHtml(rawText)`, so `[**bold**](x)` shows literal
asterisks). **E13 · LOW · ☐** — Mermaid + both CodeMirror editors are hardcoded dark theme, wrong
under the light theme and never re-init on theme flip (`diagrams.ts:20`). **E14 · LOW · ☐** — No
root drop target in the tree (only collection rows wire `ondrop`), though `/move` supports
`dest:''`. **E15 · LOW · ☐** — Refiling the doc you're editing drops edit mode
(`App.svelte:24-27`, `retargetTab` rewrites the active tab id → the "leaving a tab" effect fires).
**E16 · LOW · ☐** — `editorState.svelte.ts` is dead code (the "top-bar Save acts on any editor"
wiring was never completed; bin's FileEditor has its own separate Save).

---

## F. Rendering / README generation (`packages/core/src/render.ts`)

**F1 · MEDIUM · ☐** — Generated README table cells don't URL-encode hrefs. `render.ts:37-39,68-71`
only escapes `)`; a record `c/new york.md` yields `[New York](new york.md)` — invalid CommonMark
destination, broken link. (`parse.ts` already has `encodeHrefPath`; render doesn't use it.)

**F2 · MEDIUM · ☐** — HTML injection into generated READMEs. `render.ts:27-35` `cell()` escapes `|`
and newlines but not `<`/`>`/`&` and deliberately emits `<br>` (HTML-live context). A
`**Note:** <img src=x onerror=alert(1)>` lands verbatim in the committed README and executes in any
raw-HTML renderer (incl. grove's own, once C1 is understood).

---

## G. Core parse / read edge cases (`packages/core`)

**G1 · MEDIUM · ◐** — CRLF frontmatter is silently ignored. `parse.ts:9` `FM_RE` requires `---\n`
exactly; a Windows-authored `---\r\n…\r\n---\r\n` yields `data:{}`, so a `_status: review` draft is
mislabeled verified and the YAML pollutes the body/title/search.

**G2 · LOW · ◐** — Empty frontmatter block (`---\n---`) never matches (same regex).
**G3 · LOW · ☐** — `extends` base schema contributes only `fields`; a base setting `entry`/`extract`
is silently dropped, and only `.yaml` (not `.yml`) is probed for the base.
**G4 · LOW · ☐** — `parseStatus` keeps git's C-quoting for non-ASCII paths in the README history.
**G5 · LOW · ☐** — Empty commit-message file yields an empty subject (`node.ts:355`: `raw.trim()`
is `''`, not nullish, so the `'grove: update'` fallback is unreachable).

---

## H. Server / CLI / ingest

**H1 · HIGH · ☐** — Space registry `built` cache is keyed by name, not resolved dir
(`server/index.ts:168-178`). Two roots with a same-named space: if the first root's copy is deleted,
`dirOfSpace` resolves to the second dir but `built.has(name)` is still true → served **unbuilt**
(stale/missing `db/*`), and the stale watcher still broadcasts under that name.

**H2 · HIGH · ☐** — Zero-spaces / bad-cookie states crash. `server/index.ts:141,171,185`: with no
spaces, `defaultSpace()` returns literal `'demo'` and `ensure('demo')` throws at module top level
(won't start); at runtime a vanished last space 500s every route. A malformed `grove_space` cookie
(`%zz`) throws `URIError` in unguarded `decodeURIComponent` → 500 on every request (same on
`/incoming`, `/upload`, `/assets`).

**H3 · HIGH · ☐** — `/exec` hangs forever if `spawn` fails. `server/index.ts:511-525` listens only
for `close`; if `pnpm` isn't on PATH / EACCES, Node emits `error` and never `close` → the Promise
never resolves and the HTTP request hangs.

**H4 · HIGH · ☐** — ingest and `records create` silently clobber existing records. `ingest/index.ts`
derives the slug from the LLM title; a collision `writeFileSync`-replaces a hand-authored record and
stamps `_status: review`. `cli/ops.ts:128,142` (`records create`) has no existence check either.

**H5 · MEDIUM · ☐** — `records read` on a missing slug prints the literal string `undefined` with
exit 0 (`toCli.ts:35-37` + `read.ts:79` → `JSON.stringify(undefined)` is `undefined`). Failure
reported as success — bad for the AI terminal loop.

**H6 · MEDIUM · ☐** — ingest ignores HTTP status (`ingest/index.ts:49-58`, no `res.ok`) → a 404
page becomes a "review" record. Ingest prompt lookup key never matches the shipped
`ingest-paper.md` and can't express nested collections; it falls back to a nondeterministic first
match.

**H7 · MEDIUM · ☐** — CLI default space fabricates `./spaces/demo` and `git init`s it anywhere
(`cli/cli.ts:8-12`) when run with no `GROVE_SPACE` and no `_grove` in cwd — a stray `records create`
in `~` inits a repo there.

**H8 · LOW · ☐** — `/exec` concatenates Buffer chunks as strings (multibyte UTF-8 split across
chunks mangled). **H9 · LOW · ☐** — `loadCorpusFromDir` only skips `db/`; `.md`/`.yaml` under
`.git/` and `bin/` become phantom corpus records. **H10 · LOW · ☐** — `$GROVE_SPACE/bin` is first on
PATH (`bin/term-init.sh:7`); a web-writable `bin/git`/`bin/node` shadows the real tools the grove
shim + hooks invoke; a colon in the space path corrupts PATH. **H11 · LOW · ☐** —
`hooks commit-msg` duplicates `prepare-commit-msg` (`cli/ops.ts:263-270`); dormant but wrong if
wired. **H12 · LOW · ☐** — `spaces create --name ../x` / `meta put --path ../x` traverse outside the
space (`ops.ts:76-87,333-339`, reachable via `/exec`).

---

## Test-coverage gaps

- `query.test.ts`: only happy paths. Nothing on mixed string/number columns (D1), missing fields +
  range ops (D2), `and` in values (D3), quoted values (D6), `groupBy`, unknown agg (D5), `!=`,
  `>=`/`<=`.
- `read.test.ts`: no code fences (A3), field/built-in collisions (C5), CRLF (G1), duplicate fields.
- No direct `render.ts` tests — escaping (F1/F2), spaces-in-filenames uncovered.
- `obsidian.test.ts`: doesn't cover fenced wikilinks surviving normalization.
- No e2e for the WYSIWYG round-trip that would have caught A1/A2.

---

## Verified non-issues (checked, sound)

Theme-flash prevention (inline script in `index.html`); upload **path-traversal** (client
basename-sanitize + server `insideSpace` on the decoded path — the *overwrite* is the bug, not
traversal); `refile` correctly follows drafts/tabs for **locally** initiated moves; terminal
reconnect/close lifecycle (4000/4001 codes, idle cleanup); `md.ts`'s own href/attr escaping and
`javascript:` neutralization; commander arg parsing (`--space` either side, camelCase options,
`--sort -field`, `z.coerce.number()`), CLI exit codes on parse errors; `/exec` GROVE_SPACE wiring in
the normal absolute-path case.

---

## Fix plan / order on `review-fixes`

1. **Core data integrity (A3, D1–D5, G1–G2, C5, F1–F2)** — pure, unit-tested first. ◐ in progress.
2. **WYSIWYG round-trip (A1, A2, A4, E5)** — wikilink preservation + field-line handling + e2e.
3. **Save/commit (B1–B4)** — send `baseCommit`, real conflict detection, reset status, snapshot-safe
   clear, null-guard.
4. **Security (C1–C4)** — sanitize `{@html}`, validate `/move`, no-clobber uploads, guard decodes.
5. **Sync/render/UX (E1, E3, E4, E7, B5)** — search cache key, README tab, anchor links, bin
   refresh, commit affordances.
6. **Server/CLI (H1–H7)** — registry keying, zero-space/bad-cookie guards, `/exec` error, no-clobber
   create/ingest, missing-slug exit code.

Lower-severity items (D6–D8, E8–E16, G3–G5, H8–H12) batched after, as time allows.

---

## Resolution (branch `review-fixes`)

**Fixed and verified** (unit tests in `packages/core/test/{fences,query-edge}.test.ts`, e2e in
`e2e/review-fixes.spec.ts`, plus live browser + HTTP checks):

- Editor: **A1, A2, A3, A4, E4, E5** — `maskCode` fence-awareness across `proseOf`/`extractFields`/
  `titleOf`/`parseLinks`/`normalizeWikilinksToMarkdown`; `separateBlockLines` + `unescapeWikilinks`
  in the WYSIWYG; schema-aware `proseOf`; `.md#anchor` links.
- Save/commit: **B1, B2, B3, B4, B5** — `base` threaded to a build-gated worktree/managed conflict
  check; `isBusy()` keeps Save retryable after an error; snapshot-safe `clearCommittedDrafts`;
  null-guarded RecordEditor; New menu closes.
- Security: **C1, C2, C3, C4, C5** — DOMPurify on all `{@html}`; `/move` dest+id validation and
  atomic-with-rollback; no-clobber `/upload`; protected-path guards on `/upload`/`/incoming`;
  reserved row-key protection.
- Query/render/core: **D1, D2, D3, D4, D5, D7, F1, F2, G1, G2** — numeric-aware compare, missing-field
  exclusion, quote-aware `and`, blank-number coercion, unknown-agg error, hyphen field names,
  README href-encode + HTML-escape, CRLF/empty frontmatter.
- Sync/UX: **E1, E3, E7** — space+build-token search cache with OPFS eviction; README tabs survive
  respin; working bin refresh + no infinite "loading…".
- Server/CLI/ingest: **H1, H2, H3, H4, H5, H6, H8** — registry keyed by dir; zero-space boot +
  bad-cookie decode guards; `/exec` spawn-error handling + whole-Buffer decode; no-clobber
  `records create`/ingest; missing-slug exit 1; ingest HTTP-status check.

**Deferred** (lower severity / larger scope, not yet done): B5 richer commit UX (diff list + message
field + discard), D6, D8, E2, E6, E8–E16, G3–G5, H7, H9–H12. E2 (draft reconcile against a remote
move) and H7 (dormant duplicate hook verb) are the most worth doing next.

Pre-existing e2e failures unrelated to this branch (confirmed failing on `main`):
`audit.spec.ts:31` (strict-locator vs. the server's wikilink→markdown normalization) and
`smoke.spec.ts:114` (flaky terminal-reconnect sessionStorage timing).
