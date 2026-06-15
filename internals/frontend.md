# The frontend

**Area:** app
**Order:** 8

`@grove/app` is Svelte 5 (runes) + Vite. It calls only `grove.*` — a transport-agnostic client —
and stays a thin view over the [[internals/core-engine|engine]].

## The client seam

`grove/client.ts` is a proxy whose reads run the **pure core** over an in-memory corpus with the
draft layer overlaid (`recordRows`, `runQuery`, `buildTree`, …). So the FE queries with the exact
same engine as the CLI. The corpus is seeded from a bundled snapshot and refreshed from
`GET /corpus.json`.

## State (runes)

- `drafts.svelte` — the OPFS [[concepts/drafts-respins-and-the-log|draft]] layer.
- `sync.svelte` — the live loop: SSE/poll → reconcile against `meta.json`; `commitAll` POSTs the
  change set and handles `{ ok, conflicts }`.
- `state.svelte` — in-app tabs (the reconcile targets).

## Views

Tree (left) · collection page with the shared **DataTable** (query box + sortable table) · document
view/editor · the **Project** page (global meta + the log) · the xterm terminal.

## Editors

`CodeEditor` wraps CodeMirror 6 (markdown/yaml source). `Wysiwyg` wraps **TipTap** with
`tiptap-markdown` round-trip and a formatting bar + `[[wikilink]]` picker. `RecordEditor` switches
**Document / Form / Source** over one markdown body so the views stay in sync ([[guides/editing]]).
