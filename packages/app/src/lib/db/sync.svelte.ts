// The live loop: SSE/poll triggers → reconcile against the meta journal; commit → git-worktree
// transaction (server) → respin → reload. Merge conflicts are detected by git in the worktree
// (validate-before-merge); on conflict the server keeps main untouched and we keep the drafts.
import { noteAuth } from '../auth.svelte'
import { grove } from '../grove/client'
import { loadCorpus } from '../grove/corpusState.svelte'
import { closeByRef, tabsState } from '../state.svelte'
import { clearAllDrafts, draftsState } from './drafts.svelte'
import { invalidateSearch } from './search.svelte'

export type SyncStatus = 'idle' | 'committing' | 'rebuilding' | 'reloading' | 'error'

export const syncState = $state<{
  status: SyncStatus
  message: string
  builtAt: string
  headCommit: string
}>({ status: 'idle', message: '', builtAt: '', headCommit: '' })

export function currentHead(): string {
  return syncState.headCommit || 'dev'
}

interface MetaLite {
  builtAt: string
  headCommit: string
  respin: { status: string; error: string | null }
}

async function fetchMeta(): Promise<MetaLite | null> {
  try {
    const r = await fetch('/db/meta.json', { cache: 'no-store' })
    noteAuth(r)
    return r.ok ? ((await r.json()) as MetaLite) : null
  } catch {
    return null
  }
}

async function applyReload() {
  syncState.status = 'reloading'
  await loadCorpus()
  invalidateSearch()
  const exist = new Set(grove.search.slugs())
  for (const t of [...tabsState.tabs]) {
    if (t.kind === 'doc' && !exist.has(t.ref)) closeByRef('doc', t.ref)
  }
  syncState.status = 'idle'
  syncState.message = ''
}

export async function reconcile() {
  const meta = await fetchMeta()
  if (!meta) return
  syncState.headCommit = meta.headCommit
  if (meta.builtAt === syncState.builtAt) return
  const first = syncState.builtAt === ''
  syncState.builtAt = meta.builtAt
  if (first) return
  if (meta.respin.status === 'fail') {
    syncState.status = 'error'
    syncState.message = meta.respin.error ?? 'build failed'
    return
  }
  await applyReload()
}

export async function commitAll(): Promise<void> {
  const entries = Object.entries(draftsState.map)
  if (entries.length === 0) return

  syncState.status = 'committing'
  const files: Record<string, string> = {}
  for (const [path, d] of entries) files[path] = d.content
  try {
    const r = await fetch('/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: `grove: ${entries.length} file(s)`, files }),
    })
    const res = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      headCommit?: string
      builtAt?: string
      conflicts?: string[]
      error?: string
    }
    if (!r.ok || !res.ok) {
      // Transaction rejected — main is untouched. Keep drafts so the edit isn't lost.
      syncState.status = 'error'
      syncState.message = res.conflicts?.length
        ? `merge conflict in ${res.conflicts.join(', ')} — drafts kept, reload and retry`
        : `commit failed: ${res.error ?? `HTTP ${r.status}`} — drafts kept`
      return
    }
    clearAllDrafts()
    if (res.builtAt) syncState.builtAt = res.builtAt
    if (res.headCommit) syncState.headCommit = res.headCommit
    await applyReload() // server already rebuilt after the merge; just reload canonical
  } catch (e) {
    syncState.status = 'error'
    syncState.message = `commit failed: ${(e as Error).message} — drafts kept`
  }
}

export function startSync() {
  void reconcile()
  try {
    const es = new EventSource('/events')
    es.addEventListener('changed', () => void reconcile())
  } catch {
    // no SSE — rely on poll + focus
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void reconcile()
  })
  setInterval(() => void reconcile(), 60000)
}
