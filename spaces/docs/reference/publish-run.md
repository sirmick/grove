# publish run

**Namespace:** publish
**Verb:** run
**Mutates:** no

Push the space's committed history to its git remote — the second half of
[the commit cycle](../guides/the-commit-cycle.md) (commit is local; publish shares it). Fails
without a remote, with nothing ahead, or when git rejects the push; the worktree is never touched,
so a failure changes nothing locally. Uncommitted drafts are not included — commit them first.

`grove publish run`
