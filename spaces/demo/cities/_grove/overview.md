# Cities

The world's largest metropolitan areas — a record (shape-2) collection synthesized via the
ingestion pipeline. Each record carries **population** and **founded** (inherited from
`base-place`, both integers — founding years are negative for BCE), plus **country** and
**region**, with a short description in the body.

These fields are typed columns in `db/cities.json`, so they query cleanly, e.g.
`grove query run --collection cities --where "population>20000000" --sort -population`.
