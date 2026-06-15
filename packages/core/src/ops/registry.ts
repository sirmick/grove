// The ops registry machinery: one source of truth that the JS API, CLI, MCP, HTTP, and FE
// client all derive from. Concrete ops + handlers land in ops/index.ts (task #4).

import type { z } from 'zod'

/** Streamed progress for `streams: true` ops (ingest, build) → top-bar chip + CLI progress. */
export interface ProgressEvent {
  op: string
  phase: string
  pct?: number
  message?: string
}

/** Handler execution context. Expanded as handlers are implemented. */
export interface Ctx {
  spaceDir: string
}

// Handlers may return a value, a Promise, or an AsyncIterable<ProgressEvent> (streaming ops).
// The face generators discriminate at runtime via Symbol.asyncIterator.
export interface OpDescriptor<I extends z.ZodTypeAny = z.ZodTypeAny> {
  input: I
  handler: (input: z.infer<I>, ctx: Ctx) => unknown
  streams?: boolean
  summary?: string
}

export type OpTree = Record<string, Record<string, OpDescriptor>>

/** Identity helper that pins the registry's literal shape for the face generators. */
export function defineOps<const T extends OpTree>(tree: T): T {
  return tree
}
