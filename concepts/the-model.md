# The model

**Order:** 1

A **space** is a directory of markdown, its own git repository, and a derived `db/` (gitignored).

A **collection** is a folder with a `_grove/` metadata directory. Collections nest freely; the tree
loosely mirrors the filesystem. Each leaf `.md` file is a **record**.

Two shapes of collection, set by `entry` in [[concepts/schemas-and-extraction|schema.yaml]]:

- **doc** (`entry: editor`) — prose-first documents (these pages are docs).
- **record** (`entry: form`) — structured rows with typed fields (e.g. stocks, trades).

The distinction only changes the **default editor view** and a tree icon — extraction, querying, and
linking work the same for both. A record's typed fields come from
[[concepts/schemas-and-extraction|bold-label lines]]; everything else is just markdown.

The space root itself is a container too: global metadata lives in the top-level `_grove/`, surfaced
as the **Project** node alongside the collections.

See [[concepts/slugs-and-wikilinks]] for identity and links, and
[[concepts/drafts-respins-and-the-log]] for how changes land.
