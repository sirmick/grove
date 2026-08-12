# The commit cycle

**Order:** 6

The fundamental boundary is **Git commit**. Files may be edited by the app, the CLI, an AI, or a
plain editor; once a commit is made, grove updates generated markdown and derived
[projections](../internals/projections-and-db.md) from that canonical content.

## In the app

1. Edits accumulate as **drafts** (OPFS), overlaid on canonical reads.
2. **Commit** sends the changed files to the server as one change set.
3. The server applies them in a **git worktree transaction**: a branch off HEAD, the edits, generated
   README files, a build *in the worktree* as a gate, then a merge to the space's branch **only if it
   builds and merges cleanly**. See [worktree-transactions](../internals/worktree-transactions.md).
4. A clean merge **respins** the space (rebuilds `db/`), advancing HEAD.
5. The app reloads canonical content and clears the drafts.

If the build fails or the merge conflicts, main is untouched and your drafts are kept so you can
fix and retry.

## Publishing

Commit is **local**: it writes the space's own git history and nothing leaves the machine. **Publish**
(the button next to Commit) is the second half — it pushes the space's branch to its git remote.

- The count on the button is how many commits the remote hasn't seen. No remote, or nothing ahead,
  and the button is disabled and says which.
- Uncommitted drafts are *not* published — commit them first (the tooltip warns when some are
  pending).
- A push that git rejects (a diverged remote, missing credentials) is reported as-is and changes
  nothing locally: pull, merge, and publish again.
- For a space that lives inside a bigger repo (like `spaces/docs` in the grove repo), publishing
  pushes that repo's branch — its other commits go too, and the tooltip says so.

The same thing from the CLI:

```
grove publish status               # → { remote, branch, ahead, behind, uncommitted, … }
grove publish run                  # → pushes, reports what it sent
```

## From the CLI

For normal file edits, stage and commit once:

```
git add .
git commit -m "update notes"
```

Grove's Git hook amends the commit with generated `README.md` files, then respins `db/*`.

Quick mutation helpers still commit in place when that is the sensible unit of work:

```
grove records create --collection notes --title "Idea"
grove records promote --slug papers/some-draft
```

Those Grove helpers prepare generated `README.md` files and respin `db/*` directly, so a protected
`.git/hooks` directory does not block them. The hook is still what makes plain `git commit` behave
the same way.

For a polished multi-file change, drive the same transaction explicitly:

```
grove change begin                 # → { id, worktree }
# write files into the worktree path…
grove change commit --id <id> --message "…"
```

See [drafts-respins-and-the-log](../concepts/drafts-respins-and-the-log.md) for what a respin records.
