# Three tiers & the server

**Area:** server
**Order:** 4

`@grove/server` is a Hono server with the watcher running inside. It exposes three tiers; only the
watcher is always-on.

In multi-space mode, it scans selectable spaces from `GROVE_SPACES_ROOTS`, defaulting to the repo `spaces/` directory plus `~/spaces`. `GROVE_SPACE` still forces single-space mode.

## Read tier (the repo is the API)

- `GET /corpus.json` — the raw `{ path → contents }` map (the FE computes over it).
- `GET /db/*` — the derived [projections](projections-and-db.md) + the meta journal.
- `GET /events` — an SSE change-feed; a "changed" ping per respin drives the FE reconcile.

## Author tier (writes = git)

- `PUT /incoming/*` — atomic drop of a single file; commits in place, respins, broadcasts.
- `POST /commit` — apply a change set as a [worktree transaction](worktree-transactions.md);
  returns `{ ok, headCommit }` or `409 { conflicts | error }` (drafts kept).

Both guard paths to the space dir and to `.md`/`.yaml` only.

## Dev tier (local only)

- `POST /exec` — run the grove CLI, capture stdout/exit (for automation).
- `WS /pty` — an interactive terminal via `node-pty`, opened **in the space** with `grove`/`ai` on
  PATH ([the-ai-terminal](../guides/the-ai-terminal.md)).

In normal dev, Vite serves the app and proxies all of the above to the server (same-origin, no
CORS). In debug mode (`./run.sh` or `GROVE_DEBUG=1`), the grove server mounts Vite as middleware so
the app, API, SSE feed, and PTY websocket share one port. Production static serving is still planned.
