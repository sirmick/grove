// Open-views (tabs) model — replaces single-nav. Tabs are the reconcile targets for live updates.
import { currentSpace } from './space.svelte'

export type TabKind = 'collection' | 'doc' | 'search' | 'project' | 'log' | 'links' | 'file'

export interface Tab {
  id: string
  kind: TabKind
  ref: string
  title: string
}

export const tabsState = $state<{ tabs: Tab[]; activeId: string | null }>({
  tabs: [],
  activeId: null,
})

// Open tabs persist per space so switching spaces (which reloads) keeps your open documents.
const tabsKey = () => `grove.tabs.${currentSpace()}`

/** Restore open tabs for the current space. Run after bootSpace(); returns true if any were loaded. */
export function loadTabs(): boolean {
  try {
    const raw = localStorage.getItem(tabsKey())
    if (!raw) return false
    const d = JSON.parse(raw) as { tabs?: Tab[]; activeId?: string | null }
    if (Array.isArray(d.tabs) && d.tabs.length) {
      tabsState.tabs = d.tabs
      tabsState.activeId = d.activeId ?? d.tabs[0]?.id ?? null
      return true
    }
  } catch {
    /* corrupt cache */
  }
  return false
}

function saveTabs() {
  try {
    localStorage.setItem(
      tabsKey(),
      JSON.stringify({ tabs: tabsState.tabs, activeId: tabsState.activeId }),
    )
  } catch {
    /* storage disabled */
  }
}

const idOf = (kind: TabKind, ref: string) => `${kind}:${ref}`

function openTab(kind: TabKind, ref: string, title: string) {
  const id = idOf(kind, ref)
  if (!tabsState.tabs.some((t) => t.id === id)) {
    tabsState.tabs = [...tabsState.tabs, { id, kind, ref, title }]
  }
  tabsState.activeId = id
  saveTabs()
}

export function openCollection(path: string) {
  openTab('collection', path, path.split('/').pop() ?? path)
}

export function openRecord(slug: string) {
  openTab('doc', slug, slug.split('/').pop() ?? slug)
}

/** Open a raw file from the bin view (ref is the space-relative fs path, e.g. "bin/deploy.sh"). */
export function openFile(path: string) {
  openTab('file', path, path.split('/').pop() ?? path)
}

export function showSearch() {
  openTab('search', 'search', 'Search')
}

export function openProject() {
  openTab('project', 'project', 'Project')
}

export function openLog() {
  openTab('log', 'log', 'Log')
}

export function openLinks() {
  openTab('links', 'links', 'Links')
}

export function activeTab(): Tab | undefined {
  return tabsState.tabs.find((t) => t.id === tabsState.activeId)
}

export function setActive(id: string) {
  tabsState.activeId = id
  saveTabs()
}

export function closeTab(id: string) {
  const i = tabsState.tabs.findIndex((t) => t.id === id)
  tabsState.tabs = tabsState.tabs.filter((t) => t.id !== id)
  if (tabsState.activeId === id) {
    tabsState.activeId = tabsState.tabs[Math.max(0, i - 1)]?.id ?? null
  }
  saveTabs()
}

/** Close a tab by (kind, ref) — used by reconcile when a record is deleted upstream. */
export function closeByRef(kind: TabKind, ref: string) {
  closeTab(idOf(kind, ref))
}

/**
 * Repoint a tab (kind+ref) to a new ref after a re-file, keeping it active if it was. If a tab for
 * the destination already exists, the source tab is closed instead (dedupe). No-op if absent.
 */
export function retargetTab(kind: TabKind, oldRef: string, newRef: string, title?: string) {
  if (oldRef === newRef) return
  const oldId = idOf(kind, oldRef)
  const newId = idOf(kind, newRef)
  const t = tabsState.tabs.find((x) => x.id === oldId)
  if (!t) return
  if (tabsState.tabs.some((x) => x.id === newId)) {
    closeTab(oldId)
    return
  }
  t.id = newId
  t.ref = newRef
  if (title) t.title = title
  if (tabsState.activeId === oldId) tabsState.activeId = newId
  saveTabs()
}
