// Tree drag-drop glue: the multi-select model, the active drop-target highlight, and the drop
// handler that routes an internal drag to a re-file and an OS file drag to an upload. The pure
// payload/accept logic lives in ./dnd; this owns the reactive UI state and side effects.
import {
  type DragItem,
  TREE_MIME,
  dropForbidden,
  hasFileDrag,
  hasTreeDrag,
  readDragItems,
} from './dnd'
import { refile } from './refile'
import { uploadFiles } from './upload'

export const dnd = $state<{ dropTarget: string | null; busy: boolean; error: string }>({
  dropTarget: null,
  busy: false,
  error: '',
})

// Multi-select set, keyed by node id (record slug / collection path). Reassigned (not mutated) so
// Svelte tracks it. Drives both the .selected styling and what a drag carries.
export const selection = $state<{ items: Map<string, DragItem> }>({ items: new Map() })

export const isSelected = (id: string): boolean => selection.items.has(id)

export function selectOnly(item: DragItem) {
  selection.items = new Map([[item.id, item]])
}
export function toggleSelect(item: DragItem) {
  const m = new Map(selection.items)
  if (m.has(item.id)) m.delete(item.id)
  else m.set(item.id, item)
  selection.items = m
}
export function clearSelection() {
  if (selection.items.size) selection.items = new Map()
}

let flashTimer: ReturnType<typeof setTimeout> | undefined
function flash(msg: string) {
  dnd.error = msg
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    dnd.error = ''
  }, 4000)
}

export function onDragStart(e: DragEvent, item: DragItem) {
  if (!e.dataTransfer) return
  // Dragging a row outside the current selection drags just that row (and resets the selection to
  // it); dragging a selected row carries the whole selection.
  if (!selection.items.has(item.id)) selectOnly(item)
  const items = Array.from(selection.items.values())
  e.dataTransfer.setData(TREE_MIME, JSON.stringify(items))
  e.dataTransfer.setData('text/plain', items.map((i) => i.id).join('\n'))
  e.dataTransfer.effectAllowed = 'move'
}

// dragover can't read the payload (browsers only expose `types`, not data, mid-drag), so we accept
// on MIME presence and defer the real validity check to drop. dropForbidden still runs when the
// data happens to be readable (some engines expose it).
export function onDragOver(e: DragEvent, destPath: string) {
  const dt = e.dataTransfer
  if (!dt) return
  const tree = hasTreeDrag(dt)
  const file = hasFileDrag(dt)
  if (!tree && !file) return
  if (tree) {
    const items = readDragItems(dt)
    if (items.length && dropForbidden(items, destPath)) return
  }
  e.preventDefault()
  dt.dropEffect = file ? 'copy' : 'move'
  dnd.dropTarget = destPath
}

export function onDragLeave(destPath: string) {
  if (dnd.dropTarget === destPath) dnd.dropTarget = null
}

export async function onDrop(e: DragEvent, destPath: string) {
  e.preventDefault()
  e.stopPropagation()
  dnd.dropTarget = null
  const dt = e.dataTransfer
  if (!dt) return

  if (hasTreeDrag(dt)) {
    const items = readDragItems(dt)
    if (!items.length || dropForbidden(items, destPath)) return
    dnd.busy = true
    const r = await refile(items, destPath)
    dnd.busy = false
    clearSelection()
    if (!r.ok) flash(`move failed: ${r.error ?? 'unknown error'}`)
    return
  }

  if (hasFileDrag(dt) && dt.files?.length) {
    dnd.busy = true
    const r = await uploadFiles(destPath, Array.from(dt.files))
    dnd.busy = false
    if (r.rejected.length) flash(`skipped (unsupported): ${r.rejected.join(', ')}`)
  }
}
