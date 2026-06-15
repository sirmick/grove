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
  for (const k of Object.keys(schema.fields)) if (!seen.has(k)) warnings.push(`missing field: ${k}`)
  return { fields, warnings }
}

const LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

/** Parse `[[slug]]` / `[[slug|display]]` wikilinks into edges from `src`. */
export function parseLinks(src: string, body: string): LinkEdge[] {
  const edges: LinkEdge[] = []
  for (const m of body.matchAll(LINK_RE)) {
    const dst = m[1]?.trim()
    if (!dst) continue
    const display = m[2]?.trim()
    edges.push(display ? { src, dst, display } : { src, dst })
  }
  return edges
}
