// Transport-agnostic grove.* reads. Resolve draft-over-canonical via the core engine.
import * as core from '@grove/core'
import type { Corpus } from '@grove/core'
import { draftsState } from '../db/drafts.svelte'
import { corpusState } from './corpusState.svelte'

/** Canonical files with the OPFS draft layer overlaid. */
function files(): Corpus {
  const base = corpusState.files
  const entries = Object.entries(draftsState.map)
  if (entries.length === 0) return base
  const overlay: Corpus = { ...base }
  for (const [p, d] of entries) overlay[p] = d.content
  return overlay
}

export const grove = {
  collections: {
    tree: () => core.buildTree(files()),
    get: (path: string) => core.collectionDetail(files(), path),
    paths: () => core.collectionPaths(files()),
  },
  records: {
    list: (collection: string) => core.recordRows(files(), collection),
    read: (slug: string) => core.recordRead(files(), slug),
    exists: (slug: string) => files()[`${slug}.md`] !== undefined,
  },
  // Same pure engine the CLI/JS `grove.query.run` op uses — runs client-side over loaded rows.
  query: {
    run: (collection: string, q: core.Query) =>
      core.runQuery(core.recordRows(files(), collection) as unknown as core.Row[], q),
  },
  links: {
    of: (slug: string) => ({
      out: core.allLinks(files()).filter((l) => l.src === slug),
      in: core.backlinks(files(), slug),
    }),
  },
  schema: { get: (collection: string) => core.resolveSchema(files(), collection) },
  search: {
    docs: () => core.searchDocs(files()),
    orphans: () => core.orphans(files()),
    slugs: () => core.allRecordSlugs(files()),
  },
  meta: {
    get: (path: string) => files()[path],
    // Global (space-root) _grove assets — schema bases, templates, prompts, rules.
    globals: () =>
      Object.keys(files())
        .filter((p) => p.startsWith('_grove/'))
        .sort(),
  },
}
