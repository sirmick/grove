// Which space the app is bound to. The server resolves it from the `grove_space` cookie on every
// request (fetch, SSE, and the WS upgrade), so switching is just: set the cookie, reload. Drafts
// are scoped per space (see drafts.svelte), so each space keeps its own uncommitted edits.

export const spaceState = $state<{ spaces: string[]; current: string }>({ spaces: [], current: '' })

function cookieGet(): string {
  const m = /(?:^|;\s*)grove_space=([^;]+)/.exec(document.cookie)
  return m?.[1] ? decodeURIComponent(m[1]) : ''
}

function cookieSet(name: string) {
  document.cookie = `grove_space=${encodeURIComponent(name)};path=/;max-age=31536000`
}

/** The current space name — cookie first (authoritative), else the server-resolved default. */
export function currentSpace(): string {
  return cookieGet() || spaceState.current || 'default'
}

/** Learn the available spaces + the resolved current one, and pin the cookie so drafts scope. */
export async function bootSpace(): Promise<void> {
  try {
    const r = await fetch('/spaces', { cache: 'no-store' })
    if (!r.ok) return
    const d = (await r.json()) as { spaces: string[]; current: string }
    spaceState.spaces = d.spaces
    spaceState.current = d.current
    if (!cookieGet() && d.current) cookieSet(d.current)
  } catch {
    // single-space / offline — leave defaults; the server uses its own default
  }
}

export function switchSpace(name: string) {
  if (name === currentSpace()) return
  cookieSet(name)
  location.reload() // clean re-init: corpus, SSE, drafts, tabs all rebind to the new space
}
