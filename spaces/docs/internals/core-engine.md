# The core engine

**Area:** core
**Order:** 2

`@grove/core` is split by an `exports` map so the browser only ever gets pure code:

- **`@grove/core`** (pure, browser-safe) — the engine: parsing, schema, reads, edits, query.
- **`@grove/core/node`** (`node.ts`) — anything touching fs/git/watcher.

## Pure modules (`src/`)

- `corpus.ts` — the `Corpus` type: a flat `{ path → contents }` map of a space.
- `parse.ts` — `parseFrontmatter`, `titleOf`, `extractFields` + `coerce`, `parseLinks`.
- `schema.ts` — `parseSchema`, `mergeSchema` (the `extends` field-merge).
- `read.ts` — `buildTree`, `recordRows`, `recordRead`, `collectionDetail`, `resolveSchema`,
  `allLinks`, `backlinks`, `orphans`, `searchDocs`, `spaceWarnings`.
- `edit.ts` — `composeMarkdown`, `composeFile`, `proseOf`, `slugify`, `collectionScaffold`.
- `query.ts` — the pure [query engine](query-engine.md).
- `types.ts` — the shared contracts (`SchemaHint`, `RecordRow`, `TreeNode`, `DbMeta`, …).

## Node module (`node.ts`)

`loadCorpusFromDir`, `buildSpace` (the respin), `watchSpace` (chokidar), the git helpers
(`ensureGitRepo`, `gitCommitAll`, `headCommit`), and the
[change transaction](worktree-transactions.md).

Everything downstream — CLI, server, app — depends only on these; the engine has no framework
knowledge.
