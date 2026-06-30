# collections create

**Namespace:** collections
**Verb:** create
**Mutates:** yes

Scaffold a new collection (`_grove/schema.yaml` + `overview.md`), optionally nested. Commits in
place. See [collections-and-schemas](../guides/collections-and-schemas.md).

`grove collections create --name events --entry form`
`grove collections create --name incidents --parent events --entry editor`
