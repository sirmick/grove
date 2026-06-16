# change commit

**Namespace:** change
**Verb:** commit
**Mutates:** yes

Commit a change started with `grove change begin`: generate README files, build the worktree as a
gate, then merge → respin only if clean. Pairs with `change begin` and `change abort`. See
[[internals/worktree-transactions]].

`grove change commit --id <id> --message "add events collection"`
