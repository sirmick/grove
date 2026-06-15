# Schemas & extraction

**Order:** 3

grove keeps data **in the prose**, not in frontmatter. A field is a bold-label line:

```
# Tokyo

**Country:** Japan
**Population:** 37000000
**Founded:** 1457

Tokyo is the most populous metropolitan area on Earth.
```

The collection's `schema.yaml` declares each field and its type:

```yaml
fields:
  population: { type: integer }
  founded: { type: integer }
```

## Coercion → typed columns

At build time the extractor matches `**Label:**` lines to schema fields (case-insensitively) and
**coerces** the value by type: `integer`/`number` → numbers, `boolean` → true/false, `enum` checked
against its values, else string. A missing declared field becomes a validation warning (surfaced as
the collection's "issues" count).

Typed values land as real columns in [[internals/projections-and-db|`db/<collection>.json`]], which
is what makes [[guides/querying|querying]] sort numerically and filter by date/number.

## Two layers

Schemas merge: a global base in the space-root `_grove/schema/<name>.yaml`, pulled in with
`extends: <name>`, then the collection's own fields override by name. So shared fields (e.g. a
`base-place` with country/population/founded) are declared once.
