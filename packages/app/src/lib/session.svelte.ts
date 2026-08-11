// The session: everything in this tab that is scoped to one space, and the order it comes up in.
// Boot and space-switch run the SAME sequence — switching is just tear-down + load, in place, with
// no reload, so other browser tabs (which carry their own ?space=) are untouched.
//
// Order matters: the space must be settled BEFORE anything that keys off it (drafts, tabs, tree
// expansion, terminals all read currentSpace() at call time), and the corpus must land before tabs
// are restored so the first render has content.
import { resetBin } from './bin/bin.svelte'
import { loadDrafts, resetDrafts } from './db/drafts.svelte'
import { resetSearch } from './db/search.svelte'
import { resetSync, startSync, stopSync } from './db/sync.svelte'
import { grove } from './grove/client'
import { loadCorpus, resetCorpus } from './grove/corpusState.svelte'
import { currentSpace, setCurrent, setRebind, watchHistory } from './space.svelte'
import { loadTabs, openCollection, resetTabs } from './state.svelte'
import { loadTerms, rebindTerms } from './terminal/terminals.svelte'
import { loadExpansion } from './tree/expansion.svelte'
import { editor } from './ui.svelte'

/** Drop every piece of per-space state, live connections first. */
function teardown() {
  stopSync() // close the SSE stream + poll before anything can reconcile into the new space
  resetSync()
  resetTabs()
  resetDrafts()
  resetCorpus()
  resetSearch()
  resetBin()
  editor.editing = false
}

/** Bring the current space up: drafts + corpus, then the live loop, then the restored UI. */
async function load(): Promise<void> {
  await loadDrafts()
  await loadCorpus()
  startSync()
  loadExpansion()
  if (!loadTabs()) {
    // Nothing restored (a space seen for the first time) — open its first collection.
    const first = grove.collections.tree().find((n) => n.kind === 'collection')
    if (first?.kind === 'collection') openCollection(first.path)
  }
}

/** First load of this tab. bootSpace() must have resolved the space already. */
export async function startSession(): Promise<void> {
  setRebind(rebindSession)
  watchHistory()
  loadTerms() // reads the persisted terminal list once per tab; later switches only re-bind it
  await load()
}

/**
 * Switch this tab to `name` in place. Terminal panes for the old space unmount (their PTYs keep
 * running server-side and replay scrollback when you switch back); the new space's panes mount and
 * connect on the next render.
 */
async function rebindSession(name: string): Promise<void> {
  if (name === currentSpace()) return
  teardown()
  setCurrent(name) // from here on every currentSpace() call — and every api() URL — means `name`
  rebindTerms()
  await load()
}
