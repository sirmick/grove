# Editing documents

**Order:** 4

Click a document, then **Edit**. The editor has three views, switchable any time — they share one
markdown source, so they stay in sync:

- **Document** — the whole document as rich text (WYSIWYG): title, fields, and prose together, with
  a formatting bar (bold, headings, lists, quote, code, links) and a `[[wikilink]]` picker.
- **Form** — structured field widgets (typed inputs from the schema) plus a WYSIWYG body.
- **Source** — raw markdown, nothing else.

The `entry` hint in [[guides/collections-and-schemas|schema.yaml]] picks the default view
(`editor` → Document, `form` → Form); either is always reachable.

## Drafts & saving

Edits accumulate as **drafts** in the browser (OPFS), overlaid on the canonical files — nothing is
written to disk until you **Commit** in the top bar. Drafts survive reloads. See
[[concepts/drafts-respins-and-the-log]] and [[guides/the-commit-cycle]].

## Links

Use the `[[wikilink]]` picker in the WYSIWYG toolbar, or type `[[slug]]` in Source. Links are stored
as the full hierarchical [[concepts/slugs-and-wikilinks|slug]]; backlinks come for free.

The WYSIWYG is TipTap with markdown round-trip — see [[internals/frontend]].
