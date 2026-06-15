# Ingestion

**Order:** 7

Ingestion turns a rough source (a document, a URL; PDF later) into a structured record by running it
through Claude with the target collection's [[guides/collections-and-schemas|schema]] as the output
shape, then landing a provenance-stamped draft.

```
grove ingest run --source https://example.com/article --collection papers
```

The result is a markdown file with:

- the schema's fields extracted as bold-label lines,
- a one-line prose summary as the body,
- frontmatter provenance: `_status: review`, `_source`, `_model`.

## Review → promote

An ingested file is a **review draft** (`_status: review`) — it shows a "pending review" banner and a
`review` badge in the tree. When you've checked it:

```
grove records promote --slug papers/the-article
```

Promotion flips the status to `verified` in place, so the
[[concepts/slugs-and-wikilinks|slug and any links]] stay stable. In the app, the **Promote** button
does the same.

> The Claude call needs `ANTHROPIC_API_KEY` (server-side only). See [[internals/architecture]].
