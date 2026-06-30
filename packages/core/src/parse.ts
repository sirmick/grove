import { parse as parseYaml } from 'yaml'
import type { FieldType, LinkEdge, SchemaHint } from './types'

export interface Parsed {
  data: Record<string, unknown>
  body: string
}

const FM_RE = /^---\n([\s\S]*?)\n---\n?/

/** Split YAML frontmatter (machine/provenance) from the markdown body. */
export function parseFrontmatter(raw: string): Parsed {
  const m = FM_RE.exec(raw)
  if (!m || m[1] === undefined) return { data: {}, body: raw }
  const data = (parseYaml(m[1]) ?? {}) as Record<string, unknown>
  return { data, body: raw.slice(m[0].length) }
}

/** First `# heading`, else the fallback. */
export function titleOf(body: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(body)
  return m?.[1]?.trim() ?? fallback
}

export function coerce(type: FieldType, raw: string): unknown {
  const v = raw.trim()
  switch (type) {
    case 'integer': {
      const n = Number.parseInt(v, 10)
      return Number.isNaN(n) ? v : n
    }
    case 'number': {
      const n = Number(v)
      return Number.isNaN(n) ? v : n
    }
    case 'boolean':
      return /^(true|yes|1)$/i.test(v)
    default:
      return v
  }
}

const FIELD_RE = /^\*\*([^:*]+):\*\*\s*(.*)$/gm

/** Lenient bold-label extraction: match `**Label:** value` lines to declared fields. */
export function extractFields(
  body: string,
  schema: SchemaHint,
): { fields: Record<string, unknown>; warnings: string[] } {
  const fields: Record<string, unknown> = {}
  const warnings: string[] = []
  const byLabel = new Map(Object.keys(schema.fields).map((k) => [k.toLowerCase(), k]))
  const seen = new Set<string>()
  for (const m of body.matchAll(FIELD_RE)) {
    const label = m[1]?.trim().toLowerCase()
    if (!label) continue
    const key = byLabel.get(label)
    if (!key) continue
    const hint = schema.fields[key]
    if (!hint) continue
    fields[key] = coerce(hint.type, m[2] ?? '')
    seen.add(key)
  }
  // Optional by default: only warn for a declared-required field that no line supplied.
  for (const k of Object.keys(schema.fields))
    if (schema.fields[k]?.required && !seen.has(k)) warnings.push(`missing field: ${k}`)
  return { fields, warnings }
}

const LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
const MD_LINK_RE = /(^|[^!])\[([^\]\n]+)\]\(([^)\n]+)\)/g

function stripMdExtension(path: string): string {
  return path.replace(/\.(md|markdown)$/i, '')
}

function splitTarget(target: string): { path: string; suffix: string } {
  const hash = target.indexOf('#')
  const query = target.indexOf('?')
  const cut =
    hash >= 0 && query >= 0 ? Math.min(hash, query) : hash >= 0 ? hash : query >= 0 ? query : -1
  if (cut < 0) return { path: target, suffix: '' }
  return { path: target.slice(0, cut), suffix: target.slice(cut) }
}

function normalizePath(path: string): string {
  const out: string[] = []
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

function dirOfSlug(slug: string): string {
  const i = slug.lastIndexOf('/')
  return i < 0 ? '' : slug.slice(0, i)
}

function relativePath(fromDir: string, toFile: string): string {
  const from = fromDir ? fromDir.split('/') : []
  const to = toFile.split('/')
  let i = 0
  while (i < from.length && i < to.length && from[i] === to[i]) i++
  return (
    [...from.slice(i).map(() => '..'), ...to.slice(i)].join('/') || toFile.split('/').pop() || ''
  )
}

function encodeHrefPath(path: string): string {
  return path
    .split('/')
    .map((seg) => (seg === '..' ? seg : encodeURIComponent(seg)))
    .join('/')
}

function escapeLinkText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

function cleanMarkdownHref(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>')
    return end >= 0 ? trimmed.slice(1, end) : trimmed.slice(1)
  }
  return trimmed.split(/\s+/)[0] ?? ''
}

function decodeHrefPath(path: string): string {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

function wikiTargetSlug(target: string): { slug: string; suffix: string } {
  const { path, suffix } = splitTarget(target.trim())
  return {
    slug: stripMdExtension(path.replace(/^\/+/, '')),
    suffix,
  }
}

export function markdownHrefToSlug(src: string, href: string): string | null {
  const clean = cleanMarkdownHref(href)
  if (!clean || /^(https?:|mailto:|tel:|data:|#)/i.test(clean)) return null
  const { path } = splitTarget(clean)
  if (!/\.(md|markdown)$/i.test(path)) return null
  const decoded = decodeHrefPath(path)
  const baseDir = dirOfSlug(src)
  const resolved = decoded.startsWith('/')
    ? normalizePath(decoded.slice(1))
    : normalizePath(`${baseDir ? `${baseDir}/` : ''}${decoded}`)
  return stripMdExtension(resolved)
}

export function markdownHrefForSlug(src: string, dst: string): string {
  return encodeHrefPath(relativePath(dirOfSlug(src), `${dst}.md`))
}

function defaultLinkLabel(slug: string): string {
  return slug.split('/').pop() || slug
}

export function normalizeWikilinksToMarkdown(
  src: string,
  body: string,
  knownSlugs: ReadonlySet<string>,
): string {
  return body.replace(LINK_RE, (match, rawTarget: string, rawDisplay?: string) => {
    const { slug, suffix } = wikiTargetSlug(rawTarget)
    if (!knownSlugs.has(slug)) return match
    const label = (rawDisplay?.trim() || defaultLinkLabel(slug)).trim()
    const href = `${markdownHrefForSlug(src, slug)}${suffix.replace(/\s/g, '%20')}`
    return `[${escapeLinkText(label)}](${href.replace(/\)/g, '%29')})`
  })
}

/** Parse Grove/Obsidian wikilinks and relative Markdown `.md` links into edges from `src`. */
export function parseLinks(src: string, body: string): LinkEdge[] {
  const edges: LinkEdge[] = []
  for (const m of body.matchAll(LINK_RE)) {
    const target = m[1]?.trim()
    const dst = target ? wikiTargetSlug(target).slug : ''
    if (!dst) continue
    const display = m[2]?.trim()
    edges.push(display ? { src, dst, display } : { src, dst })
  }
  for (const m of body.matchAll(MD_LINK_RE)) {
    const dst = markdownHrefToSlug(src, m[3] ?? '')
    if (!dst) continue
    const display = m[2]?.trim()
    edges.push(display ? { src, dst, display } : { src, dst })
  }
  return edges
}
