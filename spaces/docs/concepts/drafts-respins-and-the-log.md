# Drafts, respins & the log

**Order:** 4

Three ideas govern how a change becomes canonical.

## Drafts

In the app, edits are **drafts** held in the browser (OPFS), keyed by file path and tagged with the
commit they were based on. Reads overlay drafts on canonical content, so you see your edits without
touching disk. Drafts persist across reloads and flush on **Commit**. See [[guides/editing]].

## Respin

A **respin** is a full rebuild of the derived [[internals/projections-and-db|`db/`]] from the
markdown. It runs after commits land (and when the watcher sees an external edit). A plain
`git commit` also goes through grove's hook: generated README files are amended into the commit, then
`db/*` is rebuilt. One respin = load corpus → project → write `db/*` → record the result. The app
awaits the respin, then reloads — a brief "stop the world", never a half-built state.

## The log

Each respin is appended to `db/respins.json` — status, head commit, duration, warnings. grove
**dog-foods** this as a collection: the **Project → Log** page renders it through the same
[[guides/querying|data table]], so build history is sortable and queryable like any other data.

The whole cycle — drafts → commit → [[internals/worktree-transactions|transaction]] → respin →
reload — is described in [[guides/the-commit-cycle]].
