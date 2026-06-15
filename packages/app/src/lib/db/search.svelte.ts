// Per-space search index (MiniSearch), OPFS-cached and version-tagged.
import MiniSearch from 'minisearch'
import { grove } from '../grove/client'
import { readText, writeText } from './opfs'

const VERSION = 'fixtures-1'
const FILE = `search-${VERSION}.json`
const OPTS = { fields: ['title', 'body'], storeFields: ['slug', 'title'], idField: 'slug' }

let index: MiniSearch | null = null

async function getIndex(): Promise<MiniSearch> {
  if (index) return index
  const cached = await readText(FILE)
  if (cached) {
    try {
      index = MiniSearch.loadJSON(cached, OPTS)
      return index
    } catch {
      // fall through to rebuild
    }
  }
  const idx = new MiniSearch(OPTS)
  idx.addAll(grove.search.docs())
  await writeText(FILE, JSON.stringify(idx))
  index = idx
  return idx
}

/** Drop the cached index so the next search rebuilds (after edits/commits change content). */
export function invalidateSearch() {
  index = null
}

export interface Hit {
  slug: string
  title: string
}

export const searchState = $state<{ query: string; results: Hit[] }>({ query: '', results: [] })

export async function runSearch(query: string): Promise<void> {
  searchState.query = query
  if (!query.trim()) {
    searchState.results = []
    return
  }
  const idx = await getIndex()
  searchState.results = idx
    .search(query, { prefix: true, fuzzy: 0.2 })
    .slice(0, 25)
    .map((r) => ({ slug: String(r.id), title: String((r as { title?: string }).title ?? r.id) }))
}
