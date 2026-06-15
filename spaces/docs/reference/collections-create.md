# collections create

**Namespace:** collections
**Verb:** create
**Mutates:** yes

Scaffold a new collection (`_grove/schema.yaml` + `overview.md`), optionally nested. Commits in
place. See [[guides/collections-and-schemas]].

`grove collections create --name events --entry form`
`grove collections create --name incidents --parent events --entry editor`
