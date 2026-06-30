# The AI terminal

**Order:** 8

The bottom pane is a real shell, opened **in the space** with `grove` (and `ai`) on PATH. You can run
any [grove command](using-the-cli.md) immediately, or hand the space to an AI assistant.

## `ai`

Type `ai` to launch an AI assistant interactively, seeded with two prompts:

Choose the backend with `--codex` or `--claude`; bare `ai` uses the default. Add `--yolo` only when
you want the selected backend's unsafe permission-bypass mode (`codex
--dangerously-bypass-approvals-and-sandbox`, or `claude --dangerously-skip-permissions`).

- **System prompt** — how grove works and its full command surface, **generated from the
  [ops registry](../internals/ops-registry.md)** so it never drifts from the real CLI.
- **Project prompt** — `_grove/prompt.md` for this space, **editable on the Project page**. It
  describes this particular knowledge base.

`grove ai prompt` prints the combined text; the `ai` launcher passes it to the selected AI provider.

## Space-local provider config

If a space has `_grove/ai.json`, the `ai` launcher reads it before starting the provider. This lets
each space declare the sandbox, approval behavior, working root, and extra writable directories it
needs.

Example:

```json
{
  "codex": {
    "cd": ".",
    "sandbox": "workspace-write",
    "approvalPolicy": "on-request",
    "trustedDirs": ["../shared-tools", "/opt/project-sdk"]
  }
}
```

For Codex, supported keys are:

| Key | Effect |
| --- | --- |
| `cd` / `cwd` | Passed as `-C`; relative paths resolve from the space root. Defaults to `.`. |
| `sandbox` | Passed as `--sandbox`, e.g. `workspace-write`. |
| `approvalPolicy` / `askForApproval` | Passed as `--ask-for-approval`, e.g. `on-request`. |
| `addDirs` / `trustedDirs` / `writableDirs` | Each entry is passed as `--add-dir`; relative paths resolve from the space root. |
| `args` | Extra raw provider arguments appended after the generated flags. |

Command-line arguments passed to `ai` come after the config-derived arguments, so a one-off launch can
override the space defaults.

## How it's meant to be used

Interactively — no print-mode end-runs. The AI reads the prompts, then you work with it in the
loop: it reads with `query`/`read`/`tree`, edits files directly or through helper commands, then
commits once. The commit hook handles generated README files and the respin, just as it does for any
other author.
