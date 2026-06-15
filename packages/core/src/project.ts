// Pure projection builder over a Corpus. The Node side (node.ts) adds git metadata + writes db/.
import type { Corpus } from './corpus'
import { allLinks, collectionPaths, recordRows, searchDocs } from './read'
import type { LinkEdge, RecordRow } from './types'

export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}

export interface Projections {
  collections: Record<string, RecordRow[]>
  links: LinkEdge[]
  searchDocs: Array<{ id: string; title: string; body: string }>
  collectionEtags: Record<string, { etag: string; count: number }>
}

export function buildProjections(corpus: Corpus): Projections {
  const collections: Record<string, RecordRow[]> = {}
  const collectionEtags: Record<string, { etag: string; count: number }> = {}
  for (const p of collectionPaths(corpus)) {
    const rows = recordRows(corpus, p)
    collections[p] = rows
    collectionEtags[p] = { etag: hashString(JSON.stringify(rows)), count: rows.length }
  }
  return {
    collections,
    links: allLinks(corpus),
    searchDocs: searchDocs(corpus).map((d) => ({ id: d.slug, title: d.title, body: d.body })),
    collectionEtags,
  }
}
