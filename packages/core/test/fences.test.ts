import { describe, expect, it } from 'vitest'
import { proseOf } from '../src/edit'
import {
  extractFields,
  maskCode,
  normalizeWikilinksToMarkdown,
  parseFrontmatter,
  parseLinks,
  titleOf,
} from '../src/parse'
import type { SchemaHint } from '../src/types'

const schema: SchemaHint = {
  collection: 'notes',
  extract: 'bold-label',
  entry: 'editor',
  fields: { status: { type: 'string' }, price: { type: 'number' } },
}

describe('code-fence awareness', () => {
  const doc = [
    '# Real Title',
    '',
    '**Status:** active',
    '',
    'Intro prose.',
    '',
    '```md',
    '# Not a title',
    '**Status:** fake',
    'see [[notes/other]]',
    '```',
    '',
    'Trailing `**Inline:** nope` prose.',
  ].join('\n')

  it('titleOf ignores headings inside fences', () => {
    expect(titleOf(doc, 'fallback')).toBe('Real Title')
    expect(titleOf('```\n# Fenced\n```\n# After', 'fb')).toBe('After')
  })

  it('extractFields ignores field lines inside fences and inline code', () => {
    const { fields } = extractFields(doc, schema)
    expect(fields.status).toBe('active')
  })

  it('proseOf keeps fenced content verbatim but strips real field/heading lines', () => {
    const prose = proseOf(doc)
    expect(prose).toContain('# Not a title') // preserved (inside fence)
    expect(prose).toContain('**Status:** fake') // preserved (inside fence)
    expect(prose).not.toContain('**Status:** active') // real field line stripped
    expect(prose.startsWith('# Real Title')).toBe(false) // real heading stripped
  })

  it('does not rewrite wikilinks inside fences, but does outside', () => {
    const known = new Set(['notes/other'])
    const out = normalizeWikilinksToMarkdown('notes/welcome', doc, known)
    expect(out).toContain('see [[notes/other]]') // fenced wikilink untouched
    const live = normalizeWikilinksToMarkdown('notes/welcome', 'jump to [[notes/other]] now', known)
    expect(live).toContain('[other](other.md)')
  })

  it('parseLinks ignores links inside fences', () => {
    const edges = parseLinks('notes/welcome', doc)
    expect(edges).toHaveLength(0)
    expect(parseLinks('notes/welcome', 'a [[notes/other]] b')).toHaveLength(1)
  })

  it('maskCode preserves length and newlines', () => {
    const masked = maskCode(doc)
    expect(masked.length).toBe(doc.length)
    expect(masked.split('\n').length).toBe(doc.split('\n').length)
  })
})

describe('frontmatter tolerance', () => {
  it('parses CRLF frontmatter', () => {
    const raw = '---\r\n_status: review\r\n---\r\n# Body\r\n'
    const { data, body } = parseFrontmatter(raw)
    expect(data._status).toBe('review')
    expect(body.startsWith('# Body')).toBe(true)
  })

  it('parses an empty frontmatter block', () => {
    const { data, body } = parseFrontmatter('---\n---\n# Title\n')
    expect(data).toEqual({})
    expect(body).toBe('# Title\n')
  })
})
