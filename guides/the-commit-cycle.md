# The commit cycle

**Order:** 6

grove never edits live files under you. Changes flow through a deliberate cycle so the working tree,
the git history, and the derived [[internals/projections-and-db|projections]] stay consistent.

## In the app

1. Edits accumulate as **drafts** (OPFS), overlaid on canonical reads.
2. **Commit** sends the changed files to the server as one change set.
3. The server applies them in a **git worktree transaction**: a branch off HEAD, the edits, a
   build *in the worktree* as a gate, then a merge to the space's branch **only if it builds and
   merges cleanly**. See [[internals/worktree-transactions]].
4. A clean merge **respins** the space (rebuilds `db/`), advancing HEAD.
5. The app reloads canonical content and clears the drafts.

If the build fails or the merge conflicts, main is untouched and your drafts are kept so you can
fix and retry.

## From the CLI

Quick mutations commit in place:

```
grove records create --collection notes --title "Idea"
grove records promote --slug papers/some-draft
```

For a polished multi-file change, drive the same transaction explicitly:

```
grove change begin                 # → { id, worktree }
# write files into the worktree path…
grove change commit --id <id> --message "…"
```

See [[concepts/drafts-respins-and-the-log]] for what a respin records.
