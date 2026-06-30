# Editing documents

**Order:** 4

Click a document, then **Edit**. The editor has three views, switchable any time — they share one
markdown source, so they stay in sync:

- **Document** — the whole document as rich text (WYSIWYG): title, fields, and prose together, with
  a formatting bar (bold, headings, lists, quote, code, links) and an internal-link picker.
- **Form** — structured field widgets (typed inputs from the schema) plus a WYSIWYG body.
- **Source** — raw markdown, nothing else.

The `entry` hint in [schema.yaml](collections-and-schemas.md) picks the default view
(`editor` → Document, `form` → Form); either is always reachable.

## Drafts & saving

Edits accumulate as **drafts** in the browser (OPFS), overlaid on the canonical files — nothing is
written to disk until you **Commit** in the top bar. Drafts survive reloads. See
[drafts-respins-and-the-log](../concepts/drafts-respins-and-the-log.md) and [the-commit-cycle](the-commit-cycle.md).

## Links

Use the internal-link picker in the WYSIWYG toolbar, or type a relative Markdown link in Source:
`[Tokyo](../capitals/tokyo.md)`. Grove also accepts `[[capitals/tokyo]]` as shorthand and rewrites
it to Markdown during commit preparation. Either way, backlinks come for free.

The WYSIWYG is TipTap with markdown round-trip — see [frontend](../internals/frontend.md).
