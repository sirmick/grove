// The "bin" view's data: a flat, depth-encoded listing of <space>/bin from the server (real OS
// files, not the markdown corpus). Reloaded on demand — after a save, on a manual refresh, and when
// a respin bumps builtAt (so terminal-created scripts surface).
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

export async function loadBin() {
  try {
    const r = await fetch('/fs/list', { cache: 'no-store' })
    if (!r.ok) return
    const d = (await r.json()) as { entries: FsEntry[] }
    binState.entries = Array.isArray(d.entries) ? d.entries : []
    binState.loaded = true
  } catch {
    // offline / unauthorized — leave whatever we had
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
    const r = await fetch(`/fs/read?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as FilePayload
  } catch {
    return null
  }
}

export async function writeFile(path: string, content: string): Promise<boolean> {
  try {
    const r = await fetch(`/fs/write?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: content,
    })
    return r.ok
  } catch {
    return false
  }
}
