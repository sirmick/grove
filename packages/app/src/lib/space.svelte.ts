// Which space THIS browser tab is bound to. The space travels in the URL (`?space=<name>`) and on
// every server call as a `space=` query parameter, so two tabs can sit in two different spaces at
// once and switching in one never touches the other. The `grove_space` cookie survives only as the
// "last space you used" seed for a freshly-opened tab — an explicit `?space=` always wins, both here
// and on the server.
//
// Switching is in-place: no reload. The heavy lifting (tear down + re-load everything space-scoped)
// lives in session.svelte, registered here via setRebind() so this module stays dependency-free and
// importable from anywhere (drafts, tabs, terminals, search all read currentSpace()).

export const spaceState = $state<{ spaces: string[]; current: string; switching: boolean }>({
  spaces: [],
  current: '',
  switching: false,
})

const PARAM = 'space'

function cookieGet(): string {
  const m = /(?:^|;\s*)grove_space=([^;]+)/.exec(document.cookie)
  if (!m?.[1]) return ''
  try {
    return decodeURIComponent(m[1])
  } catch {
    return ''
  }
}

function cookieSet(name: string) {
  document.cookie = `grove_space=${encodeURIComponent(name)};path=/;max-age=31536000`
}

/** The space named in this tab's URL, if any. */
function urlSpace(): string {
  return new URL(location.href).searchParams.get(PARAM) ?? ''
}

/** Pin the space into this tab's URL without navigating (replace on boot, push on a user switch). */
function pinUrl(name: string, push: boolean) {
  const u = new URL(location.href)
  if (u.searchParams.get(PARAM) === name) return
  u.searchParams.set(PARAM, name)
  history[push ? 'pushState' : 'replaceState']({}, '', `${u.pathname}${u.search}${u.hash}`)
}

/** The current space name — resolved on boot, URL first, then the last-used cookie. */
export function currentSpace(): string {
  return spaceState.current || urlSpace() || cookieGet() || 'default'
}

/**
 * Stamp a server path with the caller's space. Every fetch/SSE/WebSocket URL goes through this —
 * that's what makes the binding per-tab rather than per-browser. `space` overrides the current one
 * (used to reach a terminal living in another space).
 */
export function api(path: string, space = currentSpace()): string {
  if (!space) return path
  return `${path}${path.includes('?') ? '&' : '?'}${PARAM}=${encodeURIComponent(space)}`
}

/** fetch() against a space-stamped URL. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(api(path), init)
}

// session.svelte registers the in-place rebind; until then a switch is just a state change.
let rebind: ((name: string) => Promise<void>) | null = null
export function setRebind(fn: (name: string) => Promise<void>) {
  rebind = fn
}

/** Learn the available spaces and settle on this tab's, validated by the server. */
export async function bootSpace(): Promise<void> {
  const wanted = urlSpace() || cookieGet()
  try {
    const r = await fetch(api('/spaces', wanted), { cache: 'no-store' })
    if (!r.ok) return
    const d = (await r.json()) as { spaces: string[]; current: string }
    spaceState.spaces = d.spaces
    spaceState.current = d.current // server-validated: a bogus ?space= falls back to the default
  } catch {
    // single-space / offline — leave defaults; the server uses its own default
    spaceState.current = wanted
  }
  if (spaceState.current) {
    pinUrl(spaceState.current, false)
    cookieSet(spaceState.current)
  }
}

/** Switch this tab (only this tab) to another space, in place. */
export async function switchSpace(name: string): Promise<void> {
  if (!name || name === currentSpace() || spaceState.switching) return
  cookieSet(name) // seeds the next NEW tab; never authoritative for an existing one
  pinUrl(name, true)
  await applySpace(name)
}

/** Adopt `name` as this tab's space and re-bind everything scoped to it. */
async function applySpace(name: string): Promise<void> {
  spaceState.switching = true
  try {
    if (rebind) await rebind(name)
    else spaceState.current = name
  } finally {
    spaceState.switching = false
  }
}

/**
 * Back/forward across in-tab space switches. The URL is the record of what this tab is bound to, so
 * a history entry pointing at another space rebinds — same path as the switcher, minus the push.
 */
export function watchHistory(): void {
  window.addEventListener('popstate', () => {
    const name = urlSpace()
    if (!name || name === spaceState.current) return
    if (!spaceState.spaces.includes(name)) return
    cookieSet(name)
    void applySpace(name)
  })
}

/** Set by session.svelte's rebind as it swaps the binding over. */
export function setCurrent(name: string): void {
  spaceState.current = name
}
