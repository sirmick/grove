# Projections & db/

**Area:** core
**Order:** 6

`db/` is the derived, gitignored output of a [respin](../concepts/drafts-respins-and-the-log.md) —
regenerable from the markdown at any time. `buildSpace(spaceDir)` produces it:

1. `loadCorpusFromDir` → the `{ path → contents }` corpus.
2. `buildProjections` → per-collection rows (with
   [extracted typed fields](../concepts/schemas-and-extraction.md)), the link edge table, and search docs.
3. Git-enrich rows (last commit, mtime) and write the files.
4. Write derived output artifacts such as the Obsidian vault.

## What lands in `db/`

- `db/<collection>.json` — the rows: `{ slug, title, status, …extracted fields }`. These typed
  columns are what [query](../guides/querying.md) runs over.
- `db/links.json` — the link edges (powers backlinks/orphans).
- `db/search.json` — the search corpus.
- `db/obsidian/` — a generated Obsidian vault containing space markdown without `_grove/` internals;
  Grove wikilinks are normalized to portable Markdown links in the generated copy.
- `db/respins.json` — the [respin journal](../concepts/drafts-respins-and-the-log.md).
- `db/meta.json` — written **last**: `headCommit`, `builtAt`, the latest respin record, a parsed git
  log, per-collection etags, and output artifact status.

`meta.json` is the sync anchor: the FE compares its `builtAt`/`headCommit` to know when to reload,
and the SSE feed pings on every write. Because `db/` is gitignored, source travels via git while
derived data is served statically.
