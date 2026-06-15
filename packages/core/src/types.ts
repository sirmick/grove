// Domain + projection shapes. The contract between the watcher's output (db/*.json),
// the read handlers, the FE client, and the CLI/MCP/HTTP faces.

export type FieldType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'enum'

export interface FieldHint {
  type: FieldType
  values?: string[] // for enum
  default?: unknown
}

export interface SchemaHint {
  collection: string
  extract: 'bold-label'
  entry: 'editor' | 'form' // shape-1 (doc) | shape-2 (record)
  extends?: string // a global base schema to merge under
  fields: Record<string, FieldHint>
}

export type Status = 'review' | 'verified'

/** A row in db/<collection>.json — typed metadata, NO body. */
export interface RecordRow {
  slug: string
  title: string
  path: string
  status: Status
  lastEdited: string
  gitCommit?: string
  gitMessage?: string
  [field: string]: unknown // typed collection fields
}

export interface RecordDetail {
  meta: RecordRow
  body: string
  frontmatter: Record<string, unknown>
}

export interface LinkEdge {
  src: string
  dst: string
  display?: string
}

/** What a collection's _grove/ contains — drives the collection page without a directory listing. */
export interface MetaManifest {
  schema: boolean
  templates: string[]
  prompts: string[]
  scripts: string[]
}

export type LeafKind = 'doc' | 'record' | 'draft'

export type TreeNode =
  | { kind: 'collection'; path: string; name: string; children: TreeNode[] }
  | { kind: LeafKind; slug: string; title: string; status: Status }

export interface CollectionDetail {
  path: string
  name: string
  schema: SchemaHint
  overview: string // overview.md source
  manifest: MetaManifest
  recordCount: number
  issues: number // validation warnings
}

export interface RespinRecord {
  status: 'pass' | 'fail'
  headCommit: string
  builtAt: string
  durationMs: number
  warnings: string[]
  error: string | null
}

export interface LogEntry {
  commit: string
  at: string
  message: string
  changed: Array<{ status: string; path: string }> // status: A | M | D | R | T
}

export interface DbMeta {
  headCommit: string
  builtAt: string
  respin: RespinRecord
  log: LogEntry[]
  collections: Record<string, { etag: string; count: number }>
}
