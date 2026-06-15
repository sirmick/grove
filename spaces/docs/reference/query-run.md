# query run

**Namespace:** query
**Verb:** run
**Mutates:** no

Filter / sort / select / aggregate a collection's typed rows. The same engine powers the UI table.
See [[guides/querying]] and [[internals/query-engine]].

`grove query run --collection cities --where "population>20000000" --sort -population`
`grove query run --collection stocks --agg "avg:pe,sum:marketCap" --groupBy sector`
