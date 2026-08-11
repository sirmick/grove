// The live loop: SSE/poll triggers → reconcile against the meta journal; commit → git-worktree
// transaction (server) → respin → reload. Merge conflicts are detected by git in the worktree
// (validate-before-merge); on conflict the server keeps main untouched and we keep the drafts.
import { noteAuth } from '../auth.svelte'
import { grove } from '../grove/client'
import { loadCorpus } from '../grove/corpusState.svelte'
import { api, apiFetch, currentSpace } from '../space.svelte'
import { closeByRef, tabsState } from '../state.svelte'
import { clearCommittedDrafts, draftsState } from './drafts.svelte'
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

// The Save button must stay clickable in the `error` state (so a failed commit can be retried) and
// in `idle`; it's only truly blocked while a commit/rebuild/reload is actually running.
export function isBusy(): boolean {
  return (
    syncState.status === 'committing' ||
    syncState.status === 'rebuilding' ||
    syncState.status === 'reloading'
  )
}

interface MetaLite {
  builtAt: string
  headCommit: string
  respin: { status: string; error: string | null }
}

async function fetchMeta(): Promise<MetaLite | null> {
  try {
    const r = await apiFetch('/db/meta.json', { cache: 'no-store' })
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
  // Close only doc tabs whose file is truly gone. Use records.exists (checks the corpus file), NOT
  // the slug list — the latter excludes README.md, which is openable from the Links view and would
  // otherwise be closed on every respin.
  for (const t of [...tabsState.tabs]) {
    if (t.kind === 'doc' && !grove.records.exists(t.ref)) closeByRef('doc', t.ref)
  }
  syncState.status = 'idle'
  syncState.message = ''
}

export async function reconcile() {
  const space = currentSpace()
  const meta = await fetchMeta()
  if (!meta) return
  // A switch landed while this was in flight: the reply describes the space we just left, and
  // applying it here would stamp the new space with a foreign builtAt/head.
  if (space !== currentSpace()) return
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

export async function commitAll(message?: string): Promise<void> {
  const entries = Object.entries(draftsState.map)
  if (entries.length === 0) return
  const subject = message?.trim() || `grove: ${entries.length} file(s)`

  syncState.status = 'committing'
  syncState.message = ''
  const files: Record<string, string> = {}
  // Snapshot each draft's updatedAt so a keystroke landing while the commit is in flight isn't
  // discarded on success (its updatedAt will differ → the draft is kept).
  const committed: Record<string, number> = {}
  for (const [path, d] of entries) {
    files[path] = d.content
    committed[path] = d.updatedAt
  }
  // If every committed draft was based on the same commit, send it so the server can branch the
  // transaction from THAT base and detect a real conflict against an advanced HEAD. Mixed/'dev'
  // bases fall back to HEAD (the previous behavior).
  const bases = new Set(entries.map(([, d]) => d.baseCommit))
  const base = bases.size === 1 && !bases.has('dev') ? entries[0]?.[1].baseCommit : undefined
  try {
    const r = await apiFetch('/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: subject, files, base }),
    })
    const res = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      headCommit?: string
      builtAt?: string
      conflicts?: string[]
      error?: string
    }
    if (!r.ok || !res.ok) {
      // Transaction rejected — main is untouched. Keep drafts so the edit isn't lost. Status stays
      // `error` (message shown), but Save is re-enabled (isBusy() is false) so it can be retried.
      syncState.status = 'error'
      syncState.message = res.conflicts?.length
        ? `merge conflict in ${res.conflicts.join(', ')} — drafts kept, reload and retry`
        : `commit failed: ${res.error ?? `HTTP ${r.status}`} — drafts kept`
      return
    }
    clearCommittedDrafts(committed)
    if (res.builtAt) syncState.builtAt = res.builtAt
    if (res.headCommit) syncState.headCommit = res.headCommit
    await applyReload() // server already rebuilt after the merge; just reload canonical
  } catch (e) {
    syncState.status = 'error'
    syncState.message = `commit failed: ${(e as Error).message} — drafts kept`
  }
}

// Live-loop handles, so a space switch can tear the old space's stream down before the new one
// opens (an SSE connection is bound to the space it was opened with, server-side).
let events: EventSource | undefined
let poll: ReturnType<typeof setInterval> | undefined
let watchingVisibility = false

export function startSync() {
  void reconcile()
  try {
    events = new EventSource(api('/events'))
    events.addEventListener('changed', () => void reconcile())
  } catch {
    // no SSE — rely on poll + focus
  }
  if (!watchingVisibility) {
    // Bound once per tab, not per space: it only ever calls reconcile(), which reads the current one.
    watchingVisibility = true
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void reconcile()
    })
  }
  poll = setInterval(() => void reconcile(), 60000)
}

/** Close the live loop for the space being left. */
export function stopSync() {
  events?.close()
  events = undefined
  if (poll) clearInterval(poll)
  poll = undefined
}

/** Forget the outgoing space's build state so the new space's first meta is a baseline, not a diff. */
export function resetSync() {
  syncState.status = 'idle'
  syncState.message = ''
  syncState.builtAt = ''
  syncState.headCommit = ''
}
