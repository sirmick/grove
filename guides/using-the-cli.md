# Using the CLI

**Order:** 2

The `grove` command is the primary interface — the app, MCP, and HTTP are other
[[concepts/the-five-faces|faces]] over the same ops. Every command is `grove <namespace> <verb>
[--option value]` and prints JSON (or plain text).

```
grove collections tree
grove records list --collection cities
grove records read --slug cities/tokyo
grove query run --collection cities --where "population>20000000" --sort -population
grove search run --q tokyo
```

## Targeting a space

The space is `$GROVE_SPACE`, or `--space <dir>`, or `spaces/demo` by default:

```
grove --space spaces/docs collections tree
```

In the [[guides/the-ai-terminal|terminal]] `grove` is already on PATH and pointed at the open space.

## Reading vs writing

Read verbs (`tree`, `list`, `read`, `query`, `search`, `links`, `schema`) never change anything.
Write verbs commit in place and trigger a [[concepts/drafts-respins-and-the-log|respin]] — see
[[guides/the-commit-cycle]]. The full list lives in **reference** (queryable).

The CLI is generated from the [[internals/ops-registry|ops registry]], so it never drifts from the
JS API.
