# Architecture

**Area:** core
**Order:** 1

grove is a pnpm monorepo (Node 22, TypeScript strict, Biome, Vitest, Playwright):

| Package | Role |
|---|---|
| `@grove/core` | the pure engine + a node-only sub-path ([core-engine](core-engine.md)) |
| `@grove/cli` | the [ops registry](ops-registry.md) + generated CLI |
| `@grove/server` | Hono [server](three-tiers-server.md) (read / author / dev tiers) |
| `@grove/app` | Svelte 5 [frontend](frontend.md) |
| `@grove/ingest` | Claude-backed [ingestion](../guides/ingestion.md) |

## Principles

- **The repo is the API.** Reads are static files + derived `db/`; there's no read API to speak of.
- **Writes are dumb + a watcher is smart.** Drop/commit a file; the watcher
  [rebuilds](projections-and-db.md) everything.
- **Decoupled by design.** Source is plain markdown + git; derived data is regenerable; the FE is
  transport-agnostic; faces are [generated from one registry](../concepts/the-five-faces.md).
- **No auth/permissions in this cut.** `ANTHROPIC_API_KEY` is server-side only, never in the browser.

The remaining pages drill into each layer: [core-engine](core-engine.md),
[ops-registry](ops-registry.md), [three-tiers-server](three-tiers-server.md),
[worktree-transactions](worktree-transactions.md), [projections-and-db](projections-and-db.md),
[query-engine](query-engine.md), [frontend](frontend.md).
