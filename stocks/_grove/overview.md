# Stocks

Ten large-cap companies with headline fundamentals — a record (shape-2) collection synthesized
via the ingestion pipeline. Each record carries **ticker**, **sector** (enum), **marketCap**
(USD billions), **pe** (price/earnings) and **dividendYield** (percent), with a one-line business
description in the body.

Fundamentals are typed columns in `db/stocks.json`, so screens are one query, e.g.
`grove query run --collection stocks --where "pe<20 and dividendYield>2" --sort -marketCap`
or `grove query run --collection stocks --agg "avg:pe,max:marketCap" --groupBy sector`.

Figures are illustrative, not investment advice.
