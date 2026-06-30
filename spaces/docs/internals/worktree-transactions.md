# Worktree transactions

**Area:** core
**Order:** 5

A committed change set is applied as a **git worktree transaction** so a bad change can never leave
the space half-built. It's one mechanism behind both the app's **Commit** and the CLI's `change`.

```
beginChange(spaceDir)        # worktree off HEAD on a branch change/<id>
writeToChange(wt, rel, …)    # mutate files in the worktree
commitChange(spaceDir, id)   # prepare generated files → commit → build (gate) → merge → respin
```

`commitChange` steps:

1. Generate README files in the worktree and commit the edits on the change branch.
2. **Build the space in the worktree** — a structural error (bad schema, etc.) fails *here*, with
   main untouched.
3. Merge the branch into the space's branch. A conflict aborts the merge and reports the conflicted
   paths.
4. On a clean build + merge, [respin](projections-and-db.md) main and advance HEAD.
5. Remove the worktree and branch.

Plain `git commit` uses the same README renderer from the repository hook: after the commit lands,
grove amends generated README files into it and respins. The worktree transaction prepares before the
branch commit instead, so the build gate validates the generated files before merge.

The result is `{ ok, headCommit }` or `{ ok: false, conflicts | error }`. The server maps a failure
to `409`; the app keeps your drafts so you can fix and retry. `commitChangeset` is the one-shot
helper (begin → write all → commit) the app and `/commit` use. Simpler Grove write helpers commit in
place and run the generated README/respin path directly; hook installation is only required for
plain Git commits made outside Grove.

This is the "polished change" path; see [the-commit-cycle](../guides/the-commit-cycle.md) and
[drafts-respins-and-the-log](../concepts/drafts-respins-and-the-log.md).
