# Getting started

**Order:** 1

grove is an agent-primary, git-backed markdown knowledge base. Content is plain `.md` files; a
watcher compiles them into queryable projections; a Svelte app and a CLI are two faces over the same
engine.

## Run it

From the repo root:

```
pnpm install
pnpm dev          # Vite app + the grove server, against spaces/demo
```

For a one-port debug stack, use `./run.sh`; it serves the Vite app, API, SSE, and terminal websocket
from the same grove server.

Open the app. To point at a different space, set `GROVE_SPACE`:

```
GROVE_SPACE=$PWD/spaces/docs pnpm dev
```

## The three panes

- **Left — tree.** Collections and their leaf documents, plus a **Project** node (global metadata,
  the respin [log](../concepts/drafts-respins-and-the-log.md), and the project-wide link map).
- **Centre — page.** A [collection](../concepts/the-model.md) page (overview, schema, a
  [data table](querying.md)) or a document (read view / editor).
- **Bottom — terminal.** A real shell with `grove` on PATH and an [`ai`](the-ai-terminal.md)
  launcher.

## Next

[using-the-cli](using-the-cli.md) · [collections-and-schemas](collections-and-schemas.md) · [editing](editing.md) ·
[querying](querying.md) · [the-commit-cycle](the-commit-cycle.md).
