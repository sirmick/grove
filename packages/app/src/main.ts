import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { loadDrafts } from './lib/db/drafts.svelte'
import { startSync } from './lib/db/sync.svelte'
import { grove } from './lib/grove/client'
import { loadCorpus } from './lib/grove/corpusState.svelte'
import { bootSpace } from './lib/space.svelte'
import { loadTabs, openCollection } from './lib/state.svelte'
import { loadTerms } from './lib/terminal/terminals.svelte'
import { loadExpansion } from './lib/tree/expansion.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app not found')

const app = mount(App, { target })

void (async () => {
  await bootSpace() // resolve the current space + pin the cookie before drafts scope to it
  await loadDrafts()
  await loadCorpus()
  startSync()
  // Restore this space's persisted UI: terminals + open tabs + tree expansion (drafts loaded above).
  loadTerms()
  loadExpansion()
  const restoredTabs = loadTabs()
  // Only auto-open the first collection on a fresh space with nothing restored.
  if (!restoredTabs) {
    const first = grove.collections.tree().find((n) => n.kind === 'collection')
    if (first?.kind === 'collection') openCollection(first.path)
  }
})()

export default app
