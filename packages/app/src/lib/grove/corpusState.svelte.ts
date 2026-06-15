import type { Corpus } from '@grove/core'
import { corpus as bundled } from '../../generated/corpus'

// Seeded from the bundled corpus (offline fallback); refreshed from the server's /corpus.json.
// Writes overlay via the draft layer (see grove/client.ts). M-later: consume db/ projections.
export const corpusState = $state<{ files: Corpus }>({ files: { ...bundled } })

export async function loadCorpus(): Promise<void> {
  try {
    const res = await fetch('/corpus.json', { cache: 'no-store' })
    if (res.ok) corpusState.files = (await res.json()) as Corpus
  } catch {
    // keep the bundled fallback
  }
}
