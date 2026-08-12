# publish status

**Namespace:** publish
**Verb:** status
**Mutates:** no

What publishing would do right now: the repo, branch, remote and upstream, how many commits are
`ahead`/`behind` it, how many `uncommitted` changes the space has, and whether it's `publishable`
(with a `reason` when it isn't). Drives the app's Publish button.

`grove publish status`
