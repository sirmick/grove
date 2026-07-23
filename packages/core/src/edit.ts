import { stringify as stringifyYaml } from 'yaml'
// Write-side helpers: compose house-format markdown, split prose, slugify, templates.
// Pure + reused by the FE editor now and the server write path later.
import { maskCode } from './parse'

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const label = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)

export interface ComposeOpts {
  title: string
  fields: Array<[string, unknown]>
  body: string
  frontmatter?: Record<string, unknown>
}

/** Assemble frontmatter + `# Title` + bold-label field lines + prose into a single markdown file. */
export function composeMarkdown(opts: ComposeOpts): string {
  const parts: string[] = []
  const fm = opts.frontmatter && Object.keys(opts.frontmatter).length ? opts.frontmatter : undefined
  if (fm) parts.push(`---\n${stringifyYaml(fm).trimEnd()}\n---`)
  parts.push(`# ${opts.title}`)
  const lines = opts.fields
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `**${label(k)}:** ${v}`)
  if (lines.length) parts.push(lines.join('\n'))
  const body = opts.body.trim()
  if (body) parts.push(body)
  return `${parts.join('\n\n')}\n`
}

/** Re-attach YAML frontmatter to a raw markdown body (inverse of parseFrontmatter). */
export function composeFile(
  frontmatter: Record<string, unknown> | undefined,
  body: string,
): string {
  const b = body.trim()
  if (frontmatter && Object.keys(frontmatter).length) {
    return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${b}\n`
  }
  return `${b}\n`
}

const FIELD_LABEL_RE = /^\*\*([^:*]+):\*\*/

/** The prose remainder of a body: drop the `# heading` and `**Label:**` field lines. Lines inside
 *  code fences are preserved even when they look like a heading or a field. When `fieldLabels` is
 *  given, ONLY those declared fields are stripped — an undeclared `**Foo:**` line is real prose and
 *  is kept (otherwise a Form-mode save would silently delete it). */
export function proseOf(body: string, fieldLabels?: readonly string[]): string {
  const known = fieldLabels ? new Set(fieldLabels.map((f) => f.toLowerCase())) : null
  const maskedLines = maskCode(body).split('\n')
  const isFieldLine = (l: string): boolean => {
    const m = FIELD_LABEL_RE.exec(l)
    if (!m) return false
    return known ? known.has((m[1] ?? '').trim().toLowerCase()) : true
  }
  return body
    .split('\n')
    .filter((l, i) => {
      const masked = maskedLines[i] ?? l
      if (masked !== l) return true // this line is (partly) code — keep it verbatim
      return !/^#\s/.test(l) && !isFieldLine(l)
    })
    .join('\n')
    .trim()
}

// The rich (TipTap) editor treats single-newline-adjacent lines as ONE paragraph and reserializes
// them joined by spaces — which silently merges the house format's `**Field:**` lines and a `#`
// heading into one line. Inserting a blank line after each heading/field line (outside code fences)
// makes each its own block, so the round-trip preserves them. Idempotent.
const HEAD_OR_FIELD_RE = /^(#{1,6}\s|\*\*[^:*]+:\*\*)/
export function separateBlockLines(body: string): string {
  const lines = body.split('\n')
  const masked = maskCode(body).split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    out.push(line)
    const isStructural = masked[i] === line && HEAD_OR_FIELD_RE.test(line)
    const next = lines[i + 1]
    if (isStructural && next !== undefined && next.trim() !== '') out.push('')
  }
  return out.join('\n')
}

// The TipTap markdown serializer escapes `[`/`]`, turning `[[slug]]` into `\[\[slug\]\]` and
// breaking wikilinks. Restore the bracket pairs (and an escaped `\|` display separator) so
// wikilinks survive an edit. Only touches doubled brackets, so ordinary escaped `\[` is left alone.
export function unescapeWikilinks(md: string): string {
  return md.replace(/\\\[\\\[([\s\S]*?)\\\]\\\]/g, (_m, inner: string) => {
    return `[[${inner.replace(/\\\|/g, '|')}]]`
  })
}

export function instantiateTemplate(tpl: string, title: string): string {
  return tpl.replace(/\{\{\s*title\s*\}\}/g, title)
}

export interface CollectionScaffoldOpts {
  name: string
  entry: 'editor' | 'form'
  extends?: string
}

/** Minimal files (relative to the new collection dir) that make a folder a grove collection. */
export function collectionScaffold(o: CollectionScaffoldOpts): Record<string, string> {
  const schema: Record<string, unknown> = {
    collection: o.name,
    extract: 'bold-label',
    entry: o.entry,
  }
  if (o.extends) schema.extends = o.extends
  schema.fields = {}
  return {
    '_grove/schema.yaml': `${stringifyYaml(schema).trimEnd()}\n`,
    '_grove/overview.md': `# ${label(o.name)}\n\nA new collection.\n`,
    // Per-collection guidance fed to the AI on launch (alongside the space's _grove/prompt.md).
    '_grove/prompt.md': `# ${label(o.name)}\n\nGuidance for working in the ${label(o.name)} collection.\n`,
  }
}
