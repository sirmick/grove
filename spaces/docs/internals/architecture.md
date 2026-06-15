# Architecture

**Area:** core
**Order:** 1

grove is a pnpm monorepo (Node 22, TypeScript strict, Biome, Vitest, Playwright):

| Package | Role |
|---|---|
| `@grove/core` | the pure engine + a node-only sub-path ([[internals/core-engine]]) |
| `@grove/cli` | the [[internals/ops-registry|ops registry]] + generated CLI |
| `@grove/server` | Hono [[internals/three-tiers-server|server]] (read / author / dev tiers) |
| `@grove/app` | Svelte 5 [[internals/frontend|frontend]] |
| `@grove/ingest` | Claude-backed [[guides/ingestion|ingestion]] |

## Principles

- **The repo is the API.** Reads are static files + derived `db/`; there's no read API to speak of.
- **Writes are dumb + a watcher is smart.** Drop/commit a file; the watcher
  [[internals/projections-and-db|rebuilds]] everything.
- **Decoupled by design.** Source is plain markdown + git; derived data is regenerable; the FE is
  transport-agnostic; faces are [[concepts/the-five-faces|generated from one registry]].
- **No auth/permissions in this cut.** `ANTHROPIC_API_KEY` is server-side only, never in the browser.

The remaining pages drill into each layer: [[internals/core-engine]],
[[internals/ops-registry]], [[internals/three-tiers-server]],
[[internals/worktree-transactions]], [[internals/projections-and-db]],
[[internals/query-engine]], [[internals/frontend]].
