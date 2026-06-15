# ingest run

**Namespace:** ingest
**Verb:** run
**Mutates:** yes

Run a source (document / URL) through Claude against the collection's schema and land a
provenance-stamped review draft. Needs `ANTHROPIC_API_KEY` (server-side). See [[guides/ingestion]].

`grove ingest run --source https://example.com/article --collection papers`
