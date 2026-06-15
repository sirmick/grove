# Slugs & wikilinks

**Order:** 2

A record's **slug** is its path minus `.md`: `cities/tokyo`, `capitals/japan/osaka`. The slug is the
position in the tree *and* the stable identity — globally unique by construction.

## Wikilinks

Link records with `[[slug]]`:

```
See [[capitals/japan/osaka]], or compare [[capitals/seoul]].
```

The canonical stored form is the full hierarchical slug; the link picker inserts it. A bare
`[[tokyo]]` resolves to a hierarchical slug at build time **iff** it's unique (otherwise a warning).

## Backlinks & orphans

The build extracts a link edge table. From it grove derives:

- **backlinks** — every record that links *to* this one (shown on the page),
- **orphans** — records nothing links to.

Because the slug is stable, **promotion and edits never move a file**, so inbound links never break.
That's why [[guides/ingestion|promotion]] is a status flip in place, not a move.
