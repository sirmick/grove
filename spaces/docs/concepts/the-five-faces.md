# The five faces

**Order:** 5

grove's guiding principle: **build the API once, get the other surfaces nearly free.** Every
operation is declared once in a namespaced **ops registry** — `{ input: zodSchema, handler }` under
`namespace.verb` — and each face is generated from it:

| Face | Form |
|---|---|
| **JS API** | the handlers themselves, typed |
| **CLI** | `grove <ns> <verb> --opt` (args derived from the zod schema) |
| **FE client** | a transport-agnostic `grove.*` proxy the Svelte app calls |
| **HTTP** | `POST /op/<ns>/<verb>` *(planned)* |
| **MCP** | `grove.<ns>.<verb>` tools *(planned)* |

Because there's one source, the CLI can't drift from the JS API, and even the AI's system prompt is
**generated from the registry** ([the-ai-terminal](../guides/the-ai-terminal.md)) — add an op and it appears everywhere.

The same "build once" instinct shows up in the [query engine](../internals/query-engine.md) (one pure
function powers the CLI and the UI table) and in the
[commit transaction](../internals/worktree-transactions.md) (one mechanism behind the app's Commit and
the CLI's `change`). See [ops-registry](../internals/ops-registry.md) for the implementation.
