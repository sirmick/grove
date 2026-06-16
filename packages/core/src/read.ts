// Pure read engine over a Corpus. Runs identically in Node (tests, watcher) and the browser.
import type { Corpus } from './corpus'
import { baseName, dirOf, isUnderGrove } from './corpus'
import { extractFields, parseFrontmatter, parseLinks, titleOf } from './parse'
import { mergeSchema, parseSchema } from './schema'
import type {
  CollectionDetail,
  FieldHint,
  LinkEdge,
  RecordDetail,
  RecordRow,
  SchemaHint,
  Status,
  TreeNode,
} from './types'

function collectionDirs(corpus: Corpus): string[] {
  const dirs = new Set<string>()
  for (const p of Object.keys(corpus)) {
    const parts = p.split('/')
    const gi = parts.indexOf('_grove')
    if (gi > 0) dirs.add(parts.slice(0, gi).join('/'))
  }
  return [...dirs].sort()
}

export function collectionPaths(corpus: Corpus): string[] {
  return collectionDirs(corpus)
}

export function resolveSchema(corpus: Corpus, dir: string): SchemaHint {
  const text = corpus[`${dir}/_grove/schema.yaml`]
  const child = text ? parseSchema(text) : { fields: {} as Record<string, FieldHint> }
  let base: { fields: Record<string, FieldHint> } | undefined
  if (child.extends) {
    const b = corpus[`_grove/schema/${child.extends}.yaml`]
    if (b) base = parseSchema(b)
  }
  return mergeSchema(base, { ...child, collection: child.collection ?? dir })
}

function leafPaths(corpus: Corpus, dir: string): string[] {
  return Object.keys(corpus)
    .filter(
      (p) =>
        p.endsWith('.md') && !isUnderGrove(p) && baseName(p) !== 'README.md' && dirOf(p) === dir,
    )
    .sort()
}

function statusOf(data: Record<string, unknown>): Status {
  return data._status === 'review' ? 'review' : 'verified'
}

function rowFor(
  corpus: Corpus,
  path: string,
  schema: SchemaHint,
): { row: RecordRow; warnings: string[] } {
  const { data, body } = parseFrontmatter(corpus[path] ?? '')
  const slug = path.slice(0, -3)
  const { fields, warnings } = extractFields(body, schema)
  const row: RecordRow = {
    slug,
    title: titleOf(body, slug.split('/').pop() ?? slug),
    path,
    status: statusOf(data),
    lastEdited: '',
    ...fields,
  }
  return { row, warnings }
}

export function recordRows(corpus: Corpus, dir: string): RecordRow[] {
  const schema = resolveSchema(corpus, dir)
  return leafPaths(corpus, dir).map((p) => rowFor(corpus, p, schema).row)
}

export function recordRead(corpus: Corpus, slug: string): RecordDetail | undefined {
  const raw = corpus[`${slug}.md`]
  if (raw === undefined) return undefined
  const schema = resolveSchema(corpus, dirOf(slug))
  const { row } = rowFor(corpus, `${slug}.md`, schema)
  const pf = parseFrontmatter(raw)
  return { meta: row, body: pf.body, frontmatter: pf.data }
}

function listMeta(corpus: Corpus, dir: string, sub: string): string[] {
  const prefix = `${dir}/_grove/${sub}/`
  return Object.keys(corpus)
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
    .sort()
}

export function collectionDetail(corpus: Corpus, dir: string): CollectionDetail {
  const schema = resolveSchema(corpus, dir)
  const rw = leafPaths(corpus, dir).map((p) => rowFor(corpus, p, schema))
  return {
    path: dir,
    name: dir.split('/').pop() ?? dir,
    schema,
    overview: corpus[`${dir}/_grove/overview.md`] ?? '',
    manifest: {
      schema: corpus[`${dir}/_grove/schema.yaml`] !== undefined,
      templates: listMeta(corpus, dir, 'templates'),
      prompts: listMeta(corpus, dir, 'prompts'),
      scripts: listMeta(corpus, dir, 'scripts'),
    },
    recordCount: rw.length,
    issues: rw.reduce((n, r) => n + r.warnings.length, 0),
  }
}

export function buildTree(corpus: Corpus): TreeNode[] {
  const dirs = collectionDirs(corpus)
  const childCollections = (parent: string) => dirs.filter((d) => dirOf(d) === parent)
  const leafNodes = (dir: string): TreeNode[] => {
    const schema = resolveSchema(corpus, dir)
    return leafPaths(corpus, dir).map((p) => {
      const { data, body } = parseFrontmatter(corpus[p] ?? '')
      const status = statusOf(data)
      const slug = p.slice(0, -3)
      const kind = status === 'review' ? 'draft' : schema.entry === 'form' ? 'record' : 'doc'
      return { kind, slug, title: titleOf(body, slug.split('/').pop() ?? slug), status }
    })
  }
  const node = (dir: string): TreeNode => ({
    kind: 'collection',
    path: dir,
    name: dir.split('/').pop() ?? dir,
    children: [...childCollections(dir).map(node), ...leafNodes(dir)],
  })
  return childCollections('').map(node)
}

export function allRecordSlugs(corpus: Corpus): string[] {
  return Object.keys(corpus)
    .filter((p) => p.endsWith('.md') && !isUnderGrove(p) && baseName(p) !== 'README.md')
    .map((p) => p.slice(0, -3))
    .sort()
}

export function allLinks(corpus: Corpus): LinkEdge[] {
  const edges: LinkEdge[] = []
  for (const [p, raw] of Object.entries(corpus)) {
    if (!p.endsWith('.md') || isUnderGrove(p) || baseName(p) === 'README.md') continue
    edges.push(...parseLinks(p.slice(0, -3), parseFrontmatter(raw).body))
  }
  return edges
}

export function backlinks(corpus: Corpus, slug: string): LinkEdge[] {
  return allLinks(corpus).filter((l) => l.dst === slug)
}

export function orphans(corpus: Corpus): string[] {
  const inbound = new Set(allLinks(corpus).map((l) => l.dst))
  return allRecordSlugs(corpus).filter((s) => !inbound.has(s))
}

/** Aggregate extraction warnings across the space (for the respin record / issues counts). */
export function spaceWarnings(corpus: Corpus): string[] {
  const out: string[] = []
  for (const dir of collectionDirs(corpus)) {
    const schema = resolveSchema(corpus, dir)
    for (const p of leafPaths(corpus, dir)) {
      for (const w of rowFor(corpus, p, schema).warnings) out.push(`${p.slice(0, -3)}: ${w}`)
    }
  }
  return out
}

export interface SearchDoc {
  slug: string
  title: string
  body: string
}

export function searchDocs(corpus: Corpus): SearchDoc[] {
  const docs: SearchDoc[] = []
  for (const [p, raw] of Object.entries(corpus)) {
    if (!p.endsWith('.md') || isUnderGrove(p) || baseName(p) === 'README.md') continue
    const { body } = parseFrontmatter(raw)
    docs.push({ slug: p.slice(0, -3), title: titleOf(body, p), body })
  }
  return docs
}
