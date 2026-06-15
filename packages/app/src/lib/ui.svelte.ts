// Shared UI state: pane sizing/collapse (persisted) + the active document's edit state. Lifting
// these out of the components lets the top bar own the contextual controls (Edit / mode / Done).

const num = (k: string, d: number) => {
  const v = Number(localStorage.getItem(k))
  return Number.isFinite(v) && v > 0 ? v : d
}
const flag = (k: string, d: boolean) => {
  const v = localStorage.getItem(k)
  return v == null ? d : v === '1'
}

export const ui = $state({
  treeW: num('grove.treeW', 260),
  termH: num('grove.termH', 200),
  treeOpen: flag('grove.treeOpen', true),
  termOpen: flag('grove.termOpen', true),
})

export function setTreeW(px: number) {
  ui.treeW = Math.max(160, Math.min(560, Math.round(px)))
  localStorage.setItem('grove.treeW', String(ui.treeW))
}
export function setTermH(px: number) {
  ui.termH = Math.max(80, Math.min(640, Math.round(px)))
  localStorage.setItem('grove.termH', String(ui.termH))
}
export function toggleTree() {
  ui.treeOpen = !ui.treeOpen
  localStorage.setItem('grove.treeOpen', ui.treeOpen ? '1' : '0')
}
export function toggleTerm() {
  ui.termOpen = !ui.termOpen
  localStorage.setItem('grove.termOpen', ui.termOpen ? '1' : '0')
}

export type EditorMode = 'document' | 'form' | 'source'
export const editor = $state<{ editing: boolean; mode: EditorMode }>({
  editing: false,
  mode: 'document',
})
