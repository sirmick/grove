This space is the **grove demo** — a small knowledge base used to exercise every feature.

Collections:
- **capitals** — capital cities (doc / shape-1), nested (`capitals/japan/...`); fields from
  `base-place` (country, population, founded) plus continent.
- **cities** — the world's largest metros (record / shape-2): population, founded (negative = BCE),
  country, region. Good for numeric/sort queries.
- **stocks** — large-cap companies (record): ticker, sector (enum), marketCap, pe, dividendYield.
- **notes** — free-form notes, heavy on `[[wikilinks]]`.
- **papers** — research papers; the ingestion target (drafts land with `_status: review`).
- **trades** — trade records (shape-2 form).

Conventions for this project:
- Keep founding years as integers (negative for BCE); keep money in the units the schema documents
  (stocks marketCap is USD billions).
- Cross-link related records with `[[slug]]` so backlinks stay rich.
- New facts you're unsure about: land them as `_status: review` and leave a note, don't assert them
  as verified.

Edit this prompt on the **Project** page — it's `_grove/prompt.md`, and it seeds every `ai` session.
