// Drag-and-drop payload + drop-accept logic for the tree. Framework-free (no DOM events, no Svelte
// runes) so it's unit-testable and reusable — the thin DOM handlers in TreeNodeItem call into it.
// Adapted from wash's fs-client/dnd.ts: wash drags absolute filesystem paths; grove drags typed
// tree items (a record slug or a collection path), since grove's tree is a meaning tree, not a
// filesystem. A drag carries a JSON array of items under application/x-grove-tree; text/plain is a
// friendly newline-joined fallback (the slugs/paths) for drops onto non-grove targets.

export const TREE_MIME = 'application/x-grove-tree'

export interface DragItem {
  type: 'record' | 'collection'
  id: string // record slug (no .md) or collection path
}

// The minimal slice of DataTransfer we touch — narrowed so tests can pass a plain object instead of
// a real DragEvent. The DOM's DataTransfer is structurally assignable to this.
export interface DragData {
  getData(format: string): string
  readonly types: readonly string[]
}

// readDragItems pulls our typed payload out of a drag. Returns [] for a missing transfer, a drag
// that doesn't carry our MIME (an OS file drop, a text drop), or malformed JSON — so foreign drags
// are ignored cleanly. Members missing a valid type/id are filtered out defensively.
export function readDragItems(dt: DragData | null | undefined): DragItem[] {
  if (!dt) return []
  const json = dt.getData(TREE_MIME)
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (Array.isArray(arr)) {
      return arr.filter(
        (x): x is DragItem =>
          x && (x.type === 'record' || x.type === 'collection') && typeof x.id === 'string',
      )
    }
  } catch {
    /* ignore */
  }
  return []
}

// hasTreeDrag / hasFileDrag are the drop-accept gates. A node previews + accepts an internal re-file
// when hasTreeDrag, and an OS upload when hasFileDrag (the browser tags external file drags with a
// "Files" type). Callers preventDefault only when one is true.
export function hasTreeDrag(dt: DragData | null | undefined): boolean {
  return !!dt && dt.types.includes(TREE_MIME)
}
export function hasFileDrag(dt: DragData | null | undefined): boolean {
  return !!dt && dt.types.includes('Files')
}

// dragItemsFor builds the payload for a dragstart: the whole current selection if the dragged row is
// part of it, else just that row. Drop handlers branch on length>1 for multi-move.
export function dragItemsFor(row: DragItem, selection: ReadonlyMap<string, DragItem>): DragItem[] {
  return selection.has(row.id) ? Array.from(selection.values()) : [row]
}

// dropForbidden reports whether dropping these items onto `destPath` (a collection path, '' = root)
// is a self-evidently invalid move the UI should refuse before hitting the server: a record already
// in dest, or a collection dropped onto itself / its own descendant / its current parent. The server
// re-validates; this just suppresses the drop-highlight for no-op or illegal targets.
export function dropForbidden(items: readonly DragItem[], destPath: string): boolean {
  const dest = destPath.replace(/^\/+|\/+$/g, '')
  return items.some((it) => {
    const parent = it.id.includes('/') ? it.id.slice(0, it.id.lastIndexOf('/')) : ''
    if (it.type === 'collection') {
      if (dest === it.id || dest.startsWith(`${it.id}/`)) return true // into self or descendant
    }
    return parent === dest // already lives here
  })
}
