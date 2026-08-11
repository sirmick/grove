// Multi-tab terminal model. Each tab is a PTY session (sid) bound to one space; the server keys its
// PTY by (space-dir, sid) and replays scrollback on reconnect, so tabs survive both reloads and
// space switches. The tab list is global and persisted; only the current space's tabs render live
// (each /pty socket names its space), so clicking a tab in another space switches THIS browser tab
// to that space in place and focuses it — the PTYs left behind keep running.
import { api, currentSpace, switchSpace } from '../space.svelte'

export interface TermTab {
  sid: string
  space: string
  title: string
}

const KEY = 'grove.terms.v1'

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
  rebindTerms()
}

/**
 * Point the strip at the current space: activate one of its terminals, opening one if it has none.
 * The tab list itself is untouched — other spaces' tabs stay in it (dimmed in the strip) and their
 * PTYs keep running server-side, so switching back resumes them with scrollback intact.
 */
export function rebindTerms() {
  const here = currentSpaceTabs()
  terms.activeSid = here[0]?.sid ?? null
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
    // Switching brings up that space in place, then we focus the terminal that was clicked (the
    // switch itself just picks the space's first one).
    void switchSpace(tab.space).then(() => {
      if (terms.tabs.some((t) => t.sid === sid)) terms.activeSid = sid
    })
    return
  }
  terms.activeSid = sid
}

export function closeTerm(sid: string) {
  const tab = terms.tabs.find((t) => t.sid === sid)
  terms.tabs = terms.tabs.filter((t) => t.sid !== sid)
  save()
  // Kill the server PTY, naming the tab's own space — closing another space's terminal from the
  // strip must kill THAT space's session, not one with the same sid here.
  if (tab) {
    void fetch(api('/pty-close', tab.space), {
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
