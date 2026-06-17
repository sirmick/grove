# 🌳 grove

An agent-primary, git-backed markdown knowledge base. Content is plain `.md` files; a watcher
compiles them into queryable projections; a Svelte app and a `grove` CLI are two faces over one
engine. Built so an AI can drive it through the CLI while you work alongside in the UI.

- **Collections** of markdown records, with `[[wikilinks]]`, backlinks, and bold-label fields that
  become **typed, queryable columns**.
- **Document / Form / Source** editing (TipTap WYSIWYG with markdown round-trip).
- **Git-backed commits** via a worktree transaction (build-gated merge → respin), with an OPFS
  draft layer in the browser.
- A built-in **terminal** with `grove` and an `ai` launcher on `PATH`, **multi-space** switching, a
  read-only **Help** panel, and server-side **screenshots** for collaboration.

## Requirements

- **Node 22+**
- **pnpm**

## Install & run

```bash
pnpm install
pnpm dev
```

Then open **http://localhost:5180** (the Vite app; it proxies the API to the grove server on
`:5179`). By default it serves selectable spaces from `spaces/` and `~/spaces`, and opens the `demo` space.

Or use the helper scripts: **`./build.sh`** (install + build) and **`./dev.sh`** — the latter runs a
network-exposed instance (app on `0.0.0.0:13000`, server on `:13001`); open
`http://<host-ip>:13000`. Both honor the env vars below (e.g. `VITE_PORT=8080 ./dev.sh`).

For a single-process debug stack, run **`./run.sh`**. It mounts the Vite app inside the grove server
so app, API, SSE, and PTY all share `GROVE_PORT` (default `13000`).

Useful env vars:

| Var | Meaning |
|---|---|
| `GROVE_SPACES_ROOTS` | path-list of selectable space roots (default `./spaces` plus `~/spaces`) |
| `GROVE_DEFAULT_SPACE` | which space to open first |
| `GROVE_SPACE` | force **single-space** mode at this path (used by e2e) |
| `VITE_PORT` / `GROVE_PORT` | split dev app / server ports (default `5180` / `5179`); `run.sh` uses `GROVE_PORT` for the merged server |
| `VITE_HOST` / `GROVE_HOST` | set to `0.0.0.0` to expose on the network |

## CLI

The same operations the UI and the AI use, generated from the ops registry:

```bash
pnpm grove --space spaces/demo collections tree
pnpm grove --space spaces/demo query run --collection cities --where "population>20000000" --sort -population
pnpm grove --space spaces/demo records read --slug cities/tokyo
```

(Inside the in-app terminal, `grove` is already on `PATH` and pointed at the open space.)

## Documentation

The docs **are a grove space** (dog-fooding the tool), checked in at
[`spaces/docs`](spaces/docs) — so you can read the markdown on GitHub, or browse it in-app:

- Click the **?** (Help) button — a read-only browser of the docs, bundled with the app.
- Or switch to the **`docs`** space from the top-left selector to read/edit it like any space
  (it's a first-class, in-repo grove space: edits commit to this repo under `spaces/docs`).

Jump in:

- **Guides** ([`spaces/docs/guides`](spaces/docs/guides)) — [getting started](spaces/docs/guides/getting-started.md) · [using the CLI](spaces/docs/guides/using-the-cli.md) · [collections & schemas](spaces/docs/guides/collections-and-schemas.md) · [editing](spaces/docs/guides/editing.md) · [querying](spaces/docs/guides/querying.md) · [the commit cycle](spaces/docs/guides/the-commit-cycle.md) · [ingestion](spaces/docs/guides/ingestion.md) · [the AI terminal](spaces/docs/guides/the-ai-terminal.md)
- **Concepts** ([`spaces/docs/concepts`](spaces/docs/concepts)) — [the model](spaces/docs/concepts/the-model.md) · [slugs & wikilinks](spaces/docs/concepts/slugs-and-wikilinks.md) · [schemas & extraction](spaces/docs/concepts/schemas-and-extraction.md) · [drafts, respins & the log](spaces/docs/concepts/drafts-respins-and-the-log.md) · [the five faces](spaces/docs/concepts/the-five-faces.md)
- **Internals** ([`spaces/docs/internals`](spaces/docs/internals)) — [architecture](spaces/docs/internals/architecture.md) · [core engine](spaces/docs/internals/core-engine.md) · [ops registry](spaces/docs/internals/ops-registry.md) · [server tiers](spaces/docs/internals/three-tiers-server.md) · [worktree transactions](spaces/docs/internals/worktree-transactions.md) · [projections & db](spaces/docs/internals/projections-and-db.md) · [query engine](spaces/docs/internals/query-engine.md) · [frontend](spaces/docs/internals/frontend.md)
- **Reference** ([`spaces/docs/reference`](spaces/docs/reference)) — one record per `grove` command.

## Scripts

```bash
pnpm dev      # app + server (against ./spaces and ~/spaces)
./run.sh      # one-port debug stack
pnpm build    # build the app
pnpm check    # typecheck + biome + unit tests
pnpm test     # unit tests (vitest)
pnpm e2e      # end-to-end tests (playwright)
```

## Layout

`packages/core` (pure engine + node), `packages/cli`, `packages/server` (Hono), `packages/app`
(Svelte 5), `packages/ingest` (Claude ingestion). Spaces can live under `spaces/`, `~/spaces`, or any root in `GROVE_SPACES_ROOTS`.
Except for checked-in `docs` and `demo`, each space should be its own git repo, versioned
independently of Grove.

## License

MIT — see [LICENSE](LICENSE).
