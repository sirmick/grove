// URL/PDF → Claude (structured output from the collection schema) → house-format markdown with
// provenance, landing as a review draft. The LLM + fetch are injectable for testing.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type SchemaHint, composeMarkdown, resolveSchema, slugify } from '@grove/core'
import { loadCorpusFromDir } from '@grove/core/node'

const MODEL = 'claude-opus-4-8'

export interface IngestResult {
  slug: string
  status: 'review'
}

export type Llm = (opts: {
  prompt: string
  content: string
  schema: Record<string, unknown>
}) => Promise<Record<string, unknown>>

/** Collection schema → JSON Schema for `output_config.format` (title + body + declared fields). */
export function toJsonSchema(schema: SchemaHint): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    title: { type: 'string' },
    body: { type: 'string' },
  }
  for (const [name, hint] of Object.entries(schema.fields)) {
    switch (hint.type) {
      case 'integer':
        properties[name] = { type: 'integer' }
        break
      case 'number':
        properties[name] = { type: 'number' }
        break
      case 'boolean':
        properties[name] = { type: 'boolean' }
        break
      case 'enum':
        properties[name] = { type: 'string', enum: hint.values ?? [] }
        break
      default:
        properties[name] = { type: 'string' } // string, date
    }
  }
  return { type: 'object', properties, required: ['title', 'body'], additionalProperties: false }
}

async function defaultFetchText(source: string): Promise<string> {
  const res = await fetch(source)
  const text = await res.text()
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Real Claude call over raw HTTPS (no SDK), using structured outputs. */
export const claudeLlm: Llm = async ({ prompt, content, schema }) => {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: `${prompt}\n\nSOURCE:\n${content.slice(0, 60000)}` }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = json.content?.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('Claude response had no text block')
  return JSON.parse(text) as Record<string, unknown>
}

export async function ingestSource(opts: {
  spaceDir: string
  source: string
  collection: string
  llm?: Llm
  fetchText?: (s: string) => Promise<string>
}): Promise<IngestResult> {
  const corpus = loadCorpusFromDir(opts.spaceDir)
  const schema = resolveSchema(corpus, opts.collection)
  const prompt =
    corpus[`${opts.collection}/_grove/prompts/ingest-${opts.collection}.md`] ??
    Object.entries(corpus).find(([p]) => p.startsWith(`${opts.collection}/_grove/prompts/`))?.[1] ??
    'Summarize the source into grove house format: emit the declared fields and a concise prose body.'

  const content = await (opts.fetchText ?? defaultFetchText)(opts.source)
  const data = await (opts.llm ?? claudeLlm)({ prompt, content, schema: toJsonSchema(schema) })

  const title = String(data.title ?? opts.source)
  const slug = `${opts.collection}/${slugify(title)}`
  const fields = Object.keys(schema.fields).map((k) => [k, data[k]] as [string, unknown])
  const md = composeMarkdown({
    title,
    fields,
    body: String(data.body ?? ''),
    frontmatter: {
      _status: 'review',
      _source: opts.source,
      _ingestedAt: new Date().toISOString(),
      _model: MODEL,
      _promptHash: createHash('sha256').update(prompt).digest('hex').slice(0, 6),
    },
  })

  const out = join(opts.spaceDir, `${slug}.md`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, md) // re-ingesting the same title overwrites the same slug (idempotent)
  return { slug, status: 'review' }
}
