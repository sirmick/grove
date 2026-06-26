// Re-file: apply a tree drag-drop. Committed records/collections move on the server (git mv +
// respin); pure-draft items (never committed) are re-keyed client-side only. For every moved path
// the OPFS drafts and any open tabs are rewritten to the new location so unsaved edits and views
// follow the file. The respin SSE then reloads the canonical corpus.
import { clearDraft, draftsState, setDraft } from '../db/drafts.svelte'
import { corpusState } from '../grove/corpusState.svelte'
import { retargetTab, tabsState } from '../state.svelte'
import type { DragItem } from './dnd'

export interface MoveResult {
  ok: boolean
  error?: string
}

const baseOf = (id: string) => id.split('/').pop() ?? id

function isCanonical(it: DragItem): boolean {
  const files = corpusState.files
  return it.type === 'record'
    ? files[`${it.id}.md`] !== undefined
    : Object.keys(files).some((p) => p === it.id || p.startsWith(`${it.id}/`))
}

export async function refile(items: DragItem[], dest: string): Promise<MoveResult> {
  const destRel = dest.replace(/^\/+|\/+$/g, '')
  const onServer = items.filter(isCanonical)

  if (onServer.length) {
    let res: Response
    try {
      res = await fetch('/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: onServer, dest: destRel }),
      })
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    }
  }

  // Re-key drafts + tabs for every item (server-moved and draft-only alike).
  for (const it of items) {
    const newId = destRel ? `${destRel}/${baseOf(it.id)}` : baseOf(it.id)
    if (newId === it.id) continue
    if (it.type === 'record') rekeyRecord(it.id, newId)
    else rekeyCollection(it.id, newId)
  }
  return { ok: true }
}

function moveDraft(oldPath: string, newPath: string) {
  const d = draftsState.map[oldPath]
  if (!d) return
  clearDraft(oldPath)
  setDraft(newPath, d.content, d.baseCommit)
}

function rekeyRecord(oldSlug: string, newSlug: string) {
  moveDraft(`${oldSlug}.md`, `${newSlug}.md`)
  retargetTab('doc', oldSlug, newSlug, baseOf(newSlug))
}

function rekeyCollection(oldPath: string, newPath: string) {
  for (const key of Object.keys(draftsState.map)) {
    if (key.startsWith(`${oldPath}/`)) moveDraft(key, newPath + key.slice(oldPath.length))
  }
  retargetTab('collection', oldPath, newPath, baseOf(newPath))
  // Doc tabs whose record lived under the moved collection follow the subtree. Snapshot the matching
  // refs first — retargetTab mutates the tab list as we go.
  const under = tabsState.tabs
    .filter((t) => t.kind === 'doc' && t.ref.startsWith(`${oldPath}/`))
    .map((t) => t.ref)
  for (const slug of under) {
    retargetTab('doc', slug, newPath + slug.slice(oldPath.length), baseOf(slug))
  }
}
