# The AI terminal

**Order:** 8

The bottom pane is a real shell, opened **in the space** with `grove` (and `ai`) on PATH. You can run
any [[guides/using-the-cli|grove command]] immediately, or hand the space to an AI assistant.

## `ai`

Type `ai` to launch an AI assistant interactively, seeded with two prompts:

Choose the backend with `--codex` or `--claude`; bare `ai` uses the default. Add `--yolo` only when
you want the selected backend's unsafe permission-bypass mode (`codex --yolo`, or
`claude --dangerously-skip-permissions`).

- **System prompt** — how grove works and its full command surface, **generated from the
  [[internals/ops-registry|ops registry]]** so it never drifts from the real CLI.
- **Project prompt** — `_grove/prompt.md` for this space, **editable on the Project page**. It
  describes this particular knowledge base.

`grove ai prompt` prints the combined text; the `ai` launcher passes it to the selected AI provider.

## How it's meant to be used

Interactively — no print-mode end-runs. The AI reads the prompts, then you work with it in the
loop: it reads with `query`/`read`/`tree`, edits files directly or through helper commands, then
commits once. The commit hook handles generated README files and the respin, just as it does for any
other author.
