# The frontend

**Area:** app
**Order:** 8

`@grove/app` is Svelte 5 (runes) + Vite. It calls only `grove.*` — a transport-agnostic client —
and stays a thin view over the [engine](core-engine.md).

## The client seam

`grove/client.ts` is a proxy whose reads run the **pure core** over an in-memory corpus with the
draft layer overlaid (`recordRows`, `runQuery`, `buildTree`, …). So the FE queries with the exact
same engine as the CLI. The corpus is seeded from a bundled snapshot and refreshed from
`GET /corpus.json`.

## State (runes)

- `drafts.svelte` — the OPFS [draft](../concepts/drafts-respins-and-the-log.md) layer.
- `sync.svelte` — the live loop: SSE/poll → reconcile against `meta.json`; `commitAll` POSTs the
  change set and handles `{ ok, conflicts }`.
- `state.svelte` — in-app tabs (the reconcile targets).
- `space.svelte` — which space **this browser tab** is bound to. It lives in the tab's URL
  (`?space=<name>`) and `api()` stamps it onto every server URL, so two tabs can hold two spaces at
  once. `session.svelte` owns the switch: no reload, just tear down everything space-scoped (SSE
  stream, tabs, drafts, search index, bin listing) and load it again for the new space. Per-space
  state is keyed by space name — `grove.tabs.<space>`, `grove.expand.<space>`, `drafts-<space>.json`
  — so switching back restores what you left, and terminals from other spaces stay in the strip
  (dimmed) with their PTYs still running server-side.

## Views

Tree (left) · collection page with the shared **DataTable** (query box + sortable table) · document
view/editor · the **Project** page (global meta + the log) · the xterm terminal.

## Editors

`CodeEditor` wraps CodeMirror 6 (markdown/yaml source). `Wysiwyg` wraps **TipTap** with
`tiptap-markdown` round-trip and a formatting bar + `[[wikilink]]` picker. `RecordEditor` switches
**Document / Form / Source** over one markdown body so the views stay in sync ([editing](../guides/editing.md)).
