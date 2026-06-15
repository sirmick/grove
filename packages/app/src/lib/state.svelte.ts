// Open-views (tabs) model — replaces single-nav. Tabs are the reconcile targets for live updates.
export type TabKind = 'collection' | 'doc' | 'search' | 'project' | 'log'

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

const idOf = (kind: TabKind, ref: string) => `${kind}:${ref}`

function openTab(kind: TabKind, ref: string, title: string) {
  const id = idOf(kind, ref)
  if (!tabsState.tabs.some((t) => t.id === id)) {
    tabsState.tabs = [...tabsState.tabs, { id, kind, ref, title }]
  }
  tabsState.activeId = id
}

export function openCollection(path: string) {
  openTab('collection', path, path.split('/').pop() ?? path)
}

export function openRecord(slug: string) {
  openTab('doc', slug, slug.split('/').pop() ?? slug)
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

export function activeTab(): Tab | undefined {
  return tabsState.tabs.find((t) => t.id === tabsState.activeId)
}

export function setActive(id: string) {
  tabsState.activeId = id
}

export function closeTab(id: string) {
  const i = tabsState.tabs.findIndex((t) => t.id === id)
  tabsState.tabs = tabsState.tabs.filter((t) => t.id !== id)
  if (tabsState.activeId === id) {
    tabsState.activeId = tabsState.tabs[Math.max(0, i - 1)]?.id ?? null
  }
}

/** Close a tab by (kind, ref) — used by reconcile when a record is deleted upstream. */
export function closeByRef(kind: TabKind, ref: string) {
  closeTab(idOf(kind, ref))
}
