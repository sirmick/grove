import { describe, expect, it } from 'vitest'
import { composeMarkdown, proseOf, slugify } from '../src/edit'
import { extractFields } from '../src/parse'
import type { SchemaHint } from '../src/types'

const schema: SchemaHint = {
  collection: 'capitals',
  extract: 'bold-label',
  entry: 'editor',
  fields: { country: { type: 'string' }, population: { type: 'integer' } },
}

describe('edit helpers', () => {
  it('slugifies titles', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
    expect(slugify('  Tokyo  ')).toBe('tokyo')
  })

  it('round-trips compose → extract (the editor save path)', () => {
    const md = composeMarkdown({
      title: 'Tokyo',
      fields: [
        ['country', 'Japan'],
        ['population', '14094034'],
      ],
      body: 'Prose mentioning [[capitals/seoul]].',
    })
    expect(md).toContain('# Tokyo')
    expect(md).toContain('**Country:** Japan')

    const { fields } = extractFields(md, schema)
    expect(fields.country).toBe('Japan')
    expect(fields.population).toBe(14094034)
    expect(proseOf(md)).toContain('[[capitals/seoul]]')
  })

  it('preserves frontmatter on compose', () => {
    const md = composeMarkdown({
      title: 'Seoul',
      fields: [['country', 'South Korea']],
      body: 'x',
      frontmatter: { _status: 'review', _source: 'https://example.com' },
    })
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('_status: review')
  })
})
