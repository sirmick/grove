# records promote

**Namespace:** records
**Verb:** promote
**Mutates:** yes

Flip a review draft (`_status: review`) to `verified`, in place — the
[slug and links stay stable](../concepts/slugs-and-wikilinks.md). See [ingestion](../guides/ingestion.md).

`grove records promote --slug papers/the-article`
