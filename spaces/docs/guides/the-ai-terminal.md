# The AI terminal

**Order:** 8

The bottom pane is a real shell, opened **in the space** with `grove` (and `ai`) on PATH. You can run
any [[guides/using-the-cli|grove command]] immediately, or hand the space to Claude.

## `ai`

Type `ai` to launch Claude interactively, seeded with two prompts:

- **System prompt** — how grove works and its full command surface, **generated from the
  [[internals/ops-registry|ops registry]]** so it never drifts from the real CLI.
- **Project prompt** — `_grove/prompt.md` for this space, **editable on the Project page**. It
  describes this particular knowledge base.

`grove ai prompt` prints the combined text; the `ai` launcher passes it to
`claude --append-system-prompt`.

## How it's meant to be used

Interactively — no `-p`/print-mode end-runs. Claude reads the prompts, then you work with it in the
loop: it reads with `query`/`read`/`tree`, writes with `records create` or a
[[guides/the-commit-cycle|change transaction]], and its edits go live through the respin cycle like
any other author.
