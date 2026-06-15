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
`:5179`). By default it serves the spaces under `spaces/` and opens the `demo` space.

Useful env vars:

| Var | Meaning |
|---|---|
| `GROVE_SPACES_ROOT` | directory of selectable spaces (default `./spaces`) |
| `GROVE_DEFAULT_SPACE` | which space to open first |
| `GROVE_SPACE` | force **single-space** mode at this path (used by e2e) |
| `VITE_PORT` / `GROVE_PORT` | app / server ports (default `5180` / `5179`) |
| `VITE_HOST` | set to `0.0.0.0` to expose on the network |

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

They cover guides (getting started, the CLI, editing, querying, the commit cycle, ingestion, the AI
terminal), the concepts, the internals, and a queryable command reference.

## Scripts

```bash
pnpm dev      # app + server (against ./spaces)
pnpm build    # build the app
pnpm check    # typecheck + biome + unit tests
pnpm test     # unit tests (vitest)
pnpm e2e      # end-to-end tests (playwright)
```

## Layout

`packages/core` (pure engine + node), `packages/cli`, `packages/server` (Hono), `packages/app`
(Svelte 5), `packages/ingest` (Claude ingestion). Spaces live under `spaces/` — each is its own git
repo, versioned independently of this one.

## License

MIT — see [LICENSE](LICENSE).
