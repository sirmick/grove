// The second half of the commit cycle. Commit is local (worktree transaction → the space's git
// history); publish pushes that history to the space's remote, which is what makes it visible to
// anyone else. Read-only status drives the button; the push itself is one POST that can't touch the
// worktree, so a rejection (auth, non-fast-forward) leaves the space exactly as it was.
import { noteAuth } from '../auth.svelte'
import { apiFetch, currentSpace } from '../space.svelte'

export interface PublishStatus {
  repo: string | null
  branch: string | null
  remote: string | null
  upstream: string | null
  ahead: number
  behind: number
  uncommitted: number
  managed: boolean
  publishable: boolean
  reason: string | null
}

const UNAVAILABLE: PublishStatus = {
  repo: null,
  branch: null,
  remote: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  uncommitted: 0,
  managed: false,
  publishable: false,
  reason: 'publishing is unavailable on this server',
}

export const publishState = $state<{
  status: PublishStatus | null
  busy: boolean
  message: string
  error: boolean
}>({ status: null, busy: false, message: '', error: false })

/** Leaving a space: its remote/ahead count says nothing about the next one. */
export function resetPublish() {
  publishState.status = null
  publishState.busy = false
  publishState.message = ''
  publishState.error = false
}

export async function refreshPublish(): Promise<void> {
  const space = currentSpace()
  try {
    const r = await apiFetch('/publish/status', { cache: 'no-store' })
    noteAuth(r)
    // A server that doesn't answer (no such route, unauthorized) must not leave the button stuck on
    // "checking…" forever — say it's unavailable and let the tooltip explain.
    if (!r.ok) {
      if (space === currentSpace()) publishState.status = { ...UNAVAILABLE }
      return
    }
    const s = (await r.json()) as PublishStatus
    // A switch landed while this was in flight — that status belongs to the space we left.
    if (space === currentSpace()) publishState.status = s
  } catch {
    // offline / no server — keep whatever we last knew
  }
}

export async function publishNow(): Promise<void> {
  if (publishState.busy) return
  publishState.busy = true
  publishState.message = ''
  publishState.error = false
  const space = currentSpace()
  try {
    const r = await apiFetch('/publish', { method: 'POST' })
    noteAuth(r)
    const res = (await r.json().catch(() => ({}))) as Partial<PublishStatus> & {
      ok?: boolean
      pushed?: number
      error?: string
    }
    if (space !== currentSpace()) return // switched away mid-push; the result isn't about this space
    if (!r.ok || !res.ok) {
      publishState.error = true
      publishState.message = `publish failed: ${res.error ?? `HTTP ${r.status}`}`
      return
    }
    const n = res.pushed ?? 0
    publishState.message = `published ${n} commit${n === 1 ? '' : 's'} → ${res.remote ?? 'remote'}`
    publishState.status = res as PublishStatus
  } catch (e) {
    publishState.error = true
    publishState.message = `publish failed: ${(e as Error).message}`
  } finally {
    publishState.busy = false
    void refreshPublish()
  }
}
