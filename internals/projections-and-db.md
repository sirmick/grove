# Projections & db/

**Area:** core
**Order:** 6

`db/` is the derived, gitignored output of a [[concepts/drafts-respins-and-the-log|respin]] —
regenerable from the markdown at any time. `buildSpace(spaceDir)` produces it:

1. `loadCorpusFromDir` → the `{ path → contents }` corpus.
2. `buildProjections` → per-collection rows (with
   [[concepts/schemas-and-extraction|extracted typed fields]]), the link edge table, and search docs.
3. Git-enrich rows (last commit, mtime) and write the files.

## What lands in `db/`

- `db/<collection>.json` — the rows: `{ slug, title, status, …extracted fields }`. These typed
  columns are what [[guides/querying|query]] runs over.
- `db/links.json` — the link edges (powers backlinks/orphans).
- `db/search.json` — the search corpus.
- `db/respins.json` — the [[concepts/drafts-respins-and-the-log|respin journal]].
- `db/meta.json` — written **last**: `headCommit`, `builtAt`, the latest respin record, a parsed git
  log, and per-collection etags.

`meta.json` is the sync anchor: the FE compares its `builtAt`/`headCommit` to know when to reload,
and the SSE feed pings on every write. Because `db/` is gitignored, source travels via git while
derived data is served statically.
