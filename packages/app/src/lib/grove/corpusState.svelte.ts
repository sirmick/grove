import type { Corpus } from '@grove/core'
import { corpus as bundled } from '../../generated/corpus'
import { noteAuth } from '../auth.svelte'
import { apiFetch, currentSpace } from '../space.svelte'

// Seeded from the bundled corpus (offline fallback); refreshed from the server's /corpus.json.
// Writes overlay via the draft layer (see grove/client.ts). M-later: consume db/ projections.
export const corpusState = $state<{ files: Corpus }>({ files: { ...bundled } })

/** Leaving a space: blank the corpus so the tree can't show the old space's records under the new
 *  space's name while its content is in flight (an empty tree reads as loading; a wrong one lies). */
export function resetCorpus(): void {
  corpusState.files = {}
}

export async function loadCorpus(): Promise<void> {
  const space = currentSpace()
  try {
    const res = await apiFetch('/corpus.json', { cache: 'no-store' })
    noteAuth(res)
    // Discard a reply that arrives after the tab switched away — it's the other space's content.
    if (res.ok && space === currentSpace()) corpusState.files = (await res.json()) as Corpus
  } catch {
    // keep the bundled fallback
  }
}
