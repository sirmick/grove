# The query engine

**Area:** core
**Order:** 7

`query.ts` is a ~110-line pure function — no dependency, browser-safe — and it's the *only* query
implementation. The CLI op `grove query run` and the FE collection-page table both call it, so they
share exact semantics ([build once](../concepts/the-five-faces.md)).

```ts
runQuery(rows, { where, sort, select, limit, agg, groupBy }): QueryResult
```

- `where` — a tiny `field OP value` grammar (`> >= < <= = != ~`), AND-joined; parsed to structured
  filters. No eval.
- `sort` — `field` / `-field`; numeric when both sides are numbers (so BCE years sort right).
- `select` / `limit` — applied to the returned rows; `count` still reflects the full match.
- `agg` — `count · sum · avg · min · max`, optionally `groupBy`.

Rows are just the [projection](projections-and-db.md) objects, so the typed columns from
extraction make numeric/date comparisons work without parsing at query time.

It's deliberately minimal — AND-only, no joins. If richer analytics are ever needed, the op
signature can front a heavier engine without changing callers. Why not an off-the-shelf dataframe
lib? One shared engine across faces beats a second, FE-only query path. See [querying](../guides/querying.md).
