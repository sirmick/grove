# Slugs & links

**Order:** 2

A record's **slug** is its path minus `.md`: `cities/tokyo`, `capitals/japan/osaka`. The slug is the
position in the tree *and* the stable identity — globally unique by construction.

## Portable links

Canonical source uses relative Markdown links so the same files work in GitHub/GitLab, Grove, and
Obsidian:

```md
See [Osaka](japan/osaka.md), or compare [Seoul](seoul.md).
```

Grove still understands `[[capitals/tokyo]]` and `[[capitals/tokyo|Tokyo]]` as editing shorthand.
During Grove commit preparation, resolvable wikilinks in authored records are rewritten to relative
Markdown links. Generated README files and the Obsidian output do the same for their derived copies.

## Backlinks & orphans

The build extracts a link edge table. From it grove derives:

- **backlinks** — every record that links *to* this one (shown on the page),
- **orphans** — records nothing links to.

Because the slug is stable, **promotion and edits never move a file**, so inbound links never break.
That's why [promotion](../guides/ingestion.md) is a status flip in place, not a move.
