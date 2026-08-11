// The "bin" view's data: a flat, depth-encoded listing of <space>/bin from the server (real OS
// files, not the markdown corpus). Reloaded on demand — after a save, on a manual refresh, and when
// a respin bumps builtAt (so terminal-created scripts surface).
import { apiFetch, currentSpace } from '../space.svelte'

export interface FsEntry {
  path: string // space-relative, e.g. "bin/deploy.sh"
  name: string
  dir: boolean
  exec: boolean
  size: number
}

export const binState = $state<{ entries: FsEntry[]; loaded: boolean }>({
  entries: [],
  loaded: false,
})

/** Leaving a space: the listing is that space's real files, so it can't carry over. */
export function resetBin() {
  binState.entries = []
  binState.loaded = false
}

export async function loadBin() {
  const space = currentSpace()
  try {
    const r = await apiFetch('/fs/list', { cache: 'no-store' })
    if (!r.ok || space !== currentSpace()) return
    const d = (await r.json()) as { entries: FsEntry[] }
    binState.entries = Array.isArray(d.entries) ? d.entries : []
  } catch {
    // offline / unauthorized — leave whatever we had
  } finally {
    // Mark loaded even on failure so the view stops showing "loading…" forever and the manual
    // refresh becomes the way to retry — unless we've since switched space, where saying "loaded"
    // about the space we left would leave the new one's empty listing looking final.
    if (space === currentSpace()) binState.loaded = true
  }
}

export interface FilePayload {
  content: string
  exec: boolean
  binary: boolean
  tooLarge?: boolean
}

export async function readFile(path: string): Promise<FilePayload | null> {
  try {
    const r = await apiFetch(`/fs/read?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as FilePayload
  } catch {
    return null
  }
}

export async function writeFile(path: string, content: string): Promise<boolean> {
  try {
    const r = await apiFetch(`/fs/write?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: content,
    })
    return r.ok
  } catch {
    return false
  }
}
