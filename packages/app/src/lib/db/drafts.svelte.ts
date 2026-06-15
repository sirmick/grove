// OPFS draft layer: uncommitted edits, keyed by file path (records `slug.md` and meta files alike),
// each tagged with the headCommit it was based on. Drafts overlay canonical reads and persist
// across sessions; Commit flushes them. (M5 swaps the interim flush for the real respin cycle.)
import { currentSpace } from '../space.svelte'
import { readText, writeText } from './opfs'

export const BASE_COMMIT = 'dev' // M5 replaces with the real meta.json headCommit

export interface Draft {
  content: string
  baseCommit: string
  updatedAt: number
}

export const draftsState = $state<{ map: Record<string, Draft>; loaded: boolean }>({
  map: {},
  loaded: false,
})

// Drafts are scoped per space so two spaces with the same paths don't collide. The space is fixed
// for a session (switching reloads), so reading it at call time is safe.
const fileName = () => `drafts-${currentSpace()}.json`

function persist() {
  void writeText(fileName(), JSON.stringify(draftsState.map))
}

export async function loadDrafts() {
  const raw = await readText(fileName())
  if (raw) {
    try {
      draftsState.map = JSON.parse(raw)
    } catch {
      // ignore corrupt cache
    }
  }
  draftsState.loaded = true
}

export function setDraft(path: string, content: string, baseCommit = BASE_COMMIT) {
  draftsState.map = { ...draftsState.map, [path]: { content, baseCommit, updatedAt: Date.now() } }
  persist()
}

export function clearDraft(path: string) {
  const { [path]: _drop, ...rest } = draftsState.map
  draftsState.map = rest
  persist()
}

export function clearAllDrafts() {
  draftsState.map = {}
  persist()
}

export function hasDraft(path: string): boolean {
  return path in draftsState.map
}

export function draftPaths(): string[] {
  return Object.keys(draftsState.map)
}

export function draftCount(): number {
  return Object.keys(draftsState.map).length
}
