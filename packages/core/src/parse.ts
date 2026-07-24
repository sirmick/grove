import { parse as parseYaml } from 'yaml'
import type { FieldType, LinkEdge, SchemaHint } from './types'

export interface Parsed {
  data: Record<string, unknown>
  body: string
}

// Tolerate CRLF and an empty frontmatter block (`---\n---`). The body starts right after the
// closing delimiter's line ending.
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/

/** Split YAML frontmatter (machine/provenance) from the markdown body. */
export function parseFrontmatter(raw: string): Parsed {
  const m = FM_RE.exec(raw)
  if (!m || m[1] === undefined) return { data: {}, body: raw }
  const data = (parseYaml(m[1]) ?? {}) as Record<string, unknown>
  return { data, body: raw.slice(m[0].length) }
}

// Replace the *content* of fenced (``` / ~~~) and inline (`…`) code spans with spaces, preserving
// every character position and newline. Lets the line/regex extractors below skip structure that
// only looks like a heading, field, or wikilink because it sits inside a code example.
export function maskCode(body: string): string {
  const out = body.split('')
  const lines = body.split('\n')
  let pos = 0
  let fence: string | null = null // the opening fence marker (``` or ~~~) when inside a block
  for (const line of lines) {
    const fenceMatch = /^(\s*)(```+|~~~+)/.exec(line)
    if (fence) {
      // Inside a fenced block: blank the whole line; a matching closing fence ends the block.
      for (let i = 0; i < line.length; i++) if (out[pos + i] !== '\n') out[pos + i] = ' '
      if (fenceMatch && line.trim().startsWith(fence)) fence = null
    } else if (fenceMatch?.[2]) {
      fence = fenceMatch[2].slice(0, 3)
      for (let i = 0; i < line.length; i++) out[pos + i] = ' '
    } else {
      // Not in a block: blank inline `code` spans on this line.
      let i = 0
      while (i < line.length) {
        if (line[i] === '`') {
          const close = line.indexOf('`', i + 1)
          if (close < 0) break
          for (let j = i; j <= close; j++) out[pos + j] = ' '
          i = close + 1
        } else i++
      }
    }
    pos += line.length + 1 // + the '\n' that split removed
  }
  return out.join('')
}

/** First `# heading` (outside code fences), else the fallback. */
export function titleOf(body: string, fallback: string): string {
  const masked = maskCode(body)
  const m = /^#\s+(.+)$/m.exec(masked)
  if (m?.index === undefined) return fallback
  const lineEnd = body.indexOf('\n', m.index)
  const line = body.slice(m.index, lineEnd < 0 ? undefined : lineEnd)
  return /^#\s+(.+)$/.exec(line)?.[1]?.trim() ?? fallback
}

export function coerce(type: FieldType, raw: string): unknown {
  const v = raw.trim()
  switch (type) {
    case 'integer': {
      if (v === '') return undefined // blank numeric field is absent, not 0
      const n = Number.parseInt(v, 10)
      return Number.isNaN(n) ? v : n
    }
    case 'number': {
      if (v === '') return undefined
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
const FIELD_LINE_RE = /^\*\*([^:*]+):\*\*\s*(.*)$/

/** Lenient bold-label extraction: match `**Label:** value` lines to declared fields. */
export function extractFields(
  body: string,
  schema: SchemaHint,
): { fields: Record<string, unknown>; warnings: string[] } {
  const fields: Record<string, unknown> = {}
  const warnings: string[] = []
  const byLabel = new Map(Object.keys(schema.fields).map((k) => [k.toLowerCase(), k]))
  const seen = new Set<string>()
  // Match on the code-masked body so a `**Label:**` line inside a code fence is ignored, then read
  // the actual value back from the original text at the same offset.
  const masked = maskCode(body)
  for (const mm of masked.matchAll(FIELD_RE)) {
    if (mm.index === undefined) continue
    const lineEnd = body.indexOf('\n', mm.index)
    const line = body.slice(mm.index, lineEnd < 0 ? undefined : lineEnd)
    const m = FIELD_LINE_RE.exec(line)
    if (!m) continue
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
  // A `[[wikilink]]` inside a code fence/span is a documentation example, not a link — leave it be.
  const masked = maskCode(body)
  return body.replace(LINK_RE, (match, rawTarget: string, rawDisplay: string, offset: number) => {
    if (masked.slice(offset, offset + 2) !== '[[') return match
    const { slug, suffix } = wikiTargetSlug(rawTarget)
    if (!knownSlugs.has(slug)) return match
    const label = (rawDisplay?.trim() || defaultLinkLabel(slug)).trim()
    const href = `${markdownHrefForSlug(src, slug)}${suffix.replace(/\s/g, '%20')}`
    return `[${escapeLinkText(label)}](${href.replace(/\)/g, '%29')})`
  })
}

/** Parse Grove/Obsidian wikilinks and relative Markdown `.md` links into edges from `src`. Links
 *  inside code fences/spans are ignored so documented syntax examples don't create phantom edges. */
export function parseLinks(src: string, body: string): LinkEdge[] {
  const edges: LinkEdge[] = []
  const masked = maskCode(body)
  for (const m of masked.matchAll(LINK_RE)) {
    const target = m[1]?.trim()
    const dst = target ? wikiTargetSlug(target).slug : ''
    if (!dst) continue
    const display = m[2]?.trim()
    edges.push(display ? { src, dst, display } : { src, dst })
  }
  for (const m of masked.matchAll(MD_LINK_RE)) {
    const dst = markdownHrefToSlug(src, m[3] ?? '')
    if (!dst) continue
    const display = m[2]?.trim()
    edges.push(display ? { src, dst, display } : { src, dst })
  }
  return edges
}
