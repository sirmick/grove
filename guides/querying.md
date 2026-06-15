# Querying

**Order:** 5

Because [[concepts/schemas-and-extraction|bold-label fields are typed]], every collection is a small
table you can filter, sort, and aggregate. The query box sits on each collection page (instant,
client-side) and the same engine is `grove query run`.

## where

`field OP value`, joined with `and`. Operators: `>  >=  <  <=  =  !=  ~` (contains).

```
grove query run --collection cities --where "population>20000000 and founded<1500"
grove query run --collection stocks --where "sector=Energy"
```

## sort / select / limit

```
grove query run --collection cities --sort -population --select title,population --limit 5
```

`-field` sorts descending. Numbers sort numerically (so `founded` handles negative BCE years).

## Aggregates

```
grove query run --collection stocks --agg "count,avg:pe,sum:marketCap" --groupBy sector
```

`count · sum · avg · min · max`, optionally grouped. The engine is a tiny pure function shared by
the CLI and the UI — see [[internals/query-engine]].
