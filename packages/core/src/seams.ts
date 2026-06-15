// Transport seams. Defined now so M2's save path and M4's git transport both target them.

export interface WriteTransport {
  /** Write a file (path relative to the space root). Atomic on the implementing side. */
  put(path: string, content: string): Promise<void>
  /** Optional: flush local changes to the backend (no-op for the dev write-middleware; push for git). */
  sync?(): Promise<void>
}
