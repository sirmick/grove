# Worktree transactions

**Area:** core
**Order:** 5

A committed change set is applied as a **git worktree transaction** so a bad change can never leave
the space half-built. It's one mechanism behind both the app's **Commit** and the CLI's `change`.

```
beginChange(spaceDir)        # worktree off HEAD on a branch change/<id>
writeToChange(wt, rel, …)    # mutate files in the worktree
commitChange(spaceDir, id)   # commit → build (gate) → merge → respin → cleanup
```

`commitChange` steps:

1. Commit the edits in the worktree branch.
2. **Build the space in the worktree** — a structural error (bad schema, etc.) fails *here*, with
   main untouched.
3. Merge the branch into the space's branch. A conflict aborts the merge and reports the conflicted
   paths.
4. On a clean build + merge, [[internals/projections-and-db|respin]] main and advance HEAD.
5. Remove the worktree and branch.

The result is `{ ok, headCommit }` or `{ ok: false, conflicts | error }`. The server maps a failure
to `409`; the app keeps your drafts so you can fix and retry. `commitChangeset` is the one-shot
helper (begin → write all → commit) the app and `/commit` use.

This is the "polished change" path; see [[guides/the-commit-cycle]] and
[[concepts/drafts-respins-and-the-log]].
