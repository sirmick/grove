// Per-space tree expansion, persisted so switching spaces (which reloads) doesn't collapse the tree.
// Stores only collections the user has explicitly toggled (path → open?); anything untouched falls
// back to the default (top-level open). Keyed by space, loaded after bootSpace().
import { currentSpace } from '../space.svelte'

export const expansion = $state<{ map: Record<string, boolean> }>({ map: {} })

const key = () => `grove.expand.${currentSpace()}`

export function loadExpansion() {
  try {
    const raw = localStorage.getItem(key())
    expansion.map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    expansion.map = {}
  }
}

function save() {
  try {
    localStorage.setItem(key(), JSON.stringify(expansion.map))
  } catch {
    /* storage disabled */
  }
}

/** Is this collection expanded? Explicit toggles win; otherwise top-level (depth 0) defaults open. */
export function isExpanded(path: string, depth: number): boolean {
  const v = expansion.map[path]
  return v === undefined ? depth < 1 : v
}

export function setExpanded(path: string, open: boolean) {
  expansion.map = { ...expansion.map, [path]: open }
  save()
}
