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

- **Left — tree.** Collections and their leaf documents, plus a **Project** node (global metadata +
  the respin [[concepts/drafts-respins-and-the-log|log]]).
- **Centre — page.** A [[concepts/the-model|collection]] page (overview, schema, a
  [[guides/querying|data table]]) or a document (read view / editor).
- **Bottom — terminal.** A real shell with `grove` on PATH and an [[guides/the-ai-terminal|`ai`]]
  launcher.

## Next

[[guides/using-the-cli]] · [[guides/collections-and-schemas]] · [[guides/editing]] ·
[[guides/querying]] · [[guides/the-commit-cycle]].
