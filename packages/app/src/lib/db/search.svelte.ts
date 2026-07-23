// Per-space search index (MiniSearch), OPFS-cached and keyed by (space, build token) so a rebuilt
// space or a switched space never serves a stale/foreign index.
import MiniSearch from 'minisearch'
import { grove } from '../grove/client'
import { currentSpace } from '../space.svelte'
import { readText, removeText, writeText } from './opfs'
import { syncState } from './sync.svelte'

const OPTS = { fields: ['title', 'body'], storeFields: ['slug', 'title'], idField: 'slug' }

// The token a cached index was built against — a space switch or a respin (builtAt bump) changes it.
const buildToken = () => `${currentSpace()}@${syncState.builtAt || 'boot'}`
const fileFor = (token: string) => `search-${encodeURIComponent(token)}.json`

let index: MiniSearch | null = null
let indexToken = ''

async function getIndex(): Promise<MiniSearch> {
  const token = buildToken()
  if (index && indexToken === token) return index
  const file = fileFor(token)
  const cached = await readText(file)
  if (cached) {
    try {
      index = MiniSearch.loadJSON(cached, OPTS)
      indexToken = token
      return index
    } catch {
      // fall through to rebuild
    }
  }
  const idx = new MiniSearch(OPTS)
  idx.addAll(grove.search.docs())
  await writeText(file, JSON.stringify(idx))
  index = idx
  indexToken = token
  return idx
}

/** Drop the cached index so the next search rebuilds (after edits/commits change content). Also
 *  removes the stale OPFS file for the current token so a reload can't resurrect it. */
export function invalidateSearch() {
  if (indexToken) void removeText(fileFor(indexToken))
  index = null
  indexToken = ''
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
