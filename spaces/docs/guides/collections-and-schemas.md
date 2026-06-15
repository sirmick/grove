# Collections & schemas

**Order:** 3

A **collection** is any folder with a `_grove/` metadata directory. Inside it:

- `schema.yaml` — field definitions (see below)
- `overview.md` — the collection's intro, shown at the top of its page
- optional `templates/`, `prompts/`

Leaf `.md` files are the records. Collections nest — a sub-folder with its own `_grove/` is a child
collection. See [[concepts/the-model]].

## schema.yaml

```yaml
collection: cities
extract: bold-label          # how fields are read from the body
entry: form                  # 'form' (record) or 'editor' (document) — sets the default editor view
extends: base-place          # optional: merge a global base schema from _grove/schema/
fields:
  population: { type: integer }
  founded: { type: integer }       # year; negative = BCE
  sector: { type: enum, values: [Tech, Energy] }
```

Field types: `string · integer · number · boolean · date · enum`. Typed values become queryable
columns — see [[concepts/schemas-and-extraction]] and [[guides/querying]].

## Creating one

In the app: **+ New → Collection…** (nests under the selected collection, or at the root). Or:

```
grove collections create --name events --entry form
grove collections create --name incidents --parent events --entry form
```

Either way it scaffolds `schema.yaml` + `overview.md` and lands through the
[[guides/the-commit-cycle|commit cycle]].
