// Best-effort OPFS cache. Any failure (no OPFS, private mode) falls back to null/no-op,
// so callers always recompute. In M4 this is superseded by the isomorphic-git working copy.
const CACHE_DIR = 'grove-cache'

async function dir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(CACHE_DIR, { create: true })
  } catch {
    return null
  }
}

export async function readText(name: string): Promise<string | null> {
  try {
    const d = await dir()
    if (!d) return null
    const fh = await d.getFileHandle(name)
    return await (await fh.getFile()).text()
  } catch {
    return null
  }
}

export async function writeText(name: string, text: string): Promise<void> {
  try {
    const d = await dir()
    if (!d) return
    const fh = await d.getFileHandle(name, { create: true })
    const w = await fh.createWritable()
    await w.write(text)
    await w.close()
  } catch {
    // ignore
  }
}
