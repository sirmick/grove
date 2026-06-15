// Write-side helpers: compose house-format markdown, split prose, slugify, templates.
// Pure + reused by the FE editor now and the server write path later.
import { stringify as stringifyYaml } from 'yaml'

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

/** The prose remainder of a body: drop the `# heading` and `**Label:**` field lines. */
export function proseOf(body: string): string {
  return body
    .split('\n')
    .filter((l) => !/^#\s/.test(l) && !/^\*\*[^:*]+:\*\*/.test(l))
    .join('\n')
    .trim()
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
  }
}
