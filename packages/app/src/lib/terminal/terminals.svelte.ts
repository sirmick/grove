// Multi-tab terminal model. Each tab is a PTY session (sid) bound to one space; the server keys its
// PTY by (space-dir, sid) and replays scrollback on reconnect, so tabs survive reloads. The tab list
// is global and persisted; only the current space's tabs render live (the /pty endpoint resolves
// the space from the request cookie), so clicking a tab in another space switches the app to that
// space — after the reload that tab is the active one.
import { currentSpace, switchSpace } from '../space.svelte'

export interface TermTab {
  sid: string
  space: string
  title: string
}

const KEY = 'grove.terms.v1'
const PENDING_ACTIVE = 'grove.terms.pendingActive' // sid to focus right after a space-switch reload

export const terms = $state<{ tabs: TermTab[]; activeSid: string | null }>({
  tabs: [],
  activeSid: null,
})

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(terms.tabs))
  } catch {
    /* storage full / disabled */
  }
}

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

export const currentSpaceTabs = (): TermTab[] =>
  terms.tabs.filter((t) => t.space === currentSpace())

/** Restore tabs on boot. Must run after bootSpace() so currentSpace() is resolved. */
export function loadTerms() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) terms.tabs = (JSON.parse(raw) as TermTab[]).filter((t) => t?.sid && t?.space)
  } catch {
    /* corrupt cache */
  }
  const pending = localStorage.getItem(PENDING_ACTIVE)
  localStorage.removeItem(PENDING_ACTIVE)
  const here = currentSpaceTabs()
  if (pending && here.some((t) => t.sid === pending)) terms.activeSid = pending
  else terms.activeSid = here[0]?.sid ?? null
  if (!here.length) newTerm() // every space opens with at least one terminal
}

export function newTerm(): string {
  const space = currentSpace()
  const n = terms.tabs.filter((t) => t.space === space).length + 1
  const tab: TermTab = { sid: uuid(), space, title: `sh ${n}` }
  terms.tabs = [...terms.tabs, tab]
  terms.activeSid = tab.sid
  save()
  return tab.sid
}

export function activateTerm(sid: string) {
  const tab = terms.tabs.find((t) => t.sid === sid)
  if (!tab) return
  if (tab.space !== currentSpace()) {
    localStorage.setItem(PENDING_ACTIVE, sid) // focus it after the reload
    switchSpace(tab.space)
    return
  }
  terms.activeSid = sid
}

export function closeTerm(sid: string) {
  const tab = terms.tabs.find((t) => t.sid === sid)
  terms.tabs = terms.tabs.filter((t) => t.sid !== sid)
  save()
  // Kill the server PTY if it's in the current space (the cookie scopes /pty-close to one space).
  if (tab && tab.space === currentSpace()) {
    void fetch('/pty-close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sid }),
    }).catch(() => {})
  }
  if (terms.activeSid === sid) {
    const next = currentSpaceTabs()[0]
    if (next) terms.activeSid = next.sid
    else newTerm()
  }
}

export function cycleTerm(dir: number) {
  const here = currentSpaceTabs()
  if (here.length < 2) return
  const i = here.findIndex((t) => t.sid === terms.activeSid)
  if (i < 0) return
  const next = here[(i + dir + here.length) % here.length]
  if (next) terms.activeSid = next.sid
}

/** OSC window-title → tab label. */
export function setTermTitle(sid: string, title: string) {
  const t = terms.tabs.find((x) => x.sid === sid)
  if (t && title && t.title !== title) {
    t.title = title
    save()
  }
}
