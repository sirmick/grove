import { describe, expect, it } from 'vitest'
import { type Row, parseAgg, parseWhere, runQuery } from '../src/query'

describe('query edge cases', () => {
  it('compares numeric-looking strings numerically', () => {
    const rows: Row[] = [
      { slug: 'a', population: '37400000' },
      { slug: 'b', population: '900000' },
    ]
    const r = runQuery(rows, { where: 'population>5000000' })
    expect(r.rows.map((x) => x.slug)).toEqual(['a'])
  })

  it('rows missing the field do not match range filters', () => {
    const rows: Row[] = [{ slug: 'a', population: 50 }, { slug: 'b' }]
    expect(runQuery(rows, { where: 'population<100' }).rows.map((x) => x.slug)).toEqual(['a'])
    expect(runQuery(rows, { where: 'bogus<5' }).rows).toEqual([]) // typo'd field → nothing
  })

  it('keeps " and " inside a quoted value as one clause', () => {
    expect(parseWhere('title~"rock and roll"')).toEqual([
      { field: 'title', op: '~', value: 'rock and roll' },
    ])
    const rows: Row[] = [
      { slug: 'a', title: 'Rock and Roll' },
      { slug: 'b', title: 'Jazz' },
    ]
    expect(runQuery(rows, { where: 'title~"rock and roll"' }).rows.map((x) => x.slug)).toEqual([
      'a',
    ])
  })

  it('throws on an unknown aggregate function', () => {
    expect(() => parseAgg('median:x')).toThrow(/unknown aggregate/)
  })

  it('accepts hyphenated field names in filters', () => {
    expect(parseWhere('market-cap>5')).toEqual([{ field: 'market-cap', op: '>', value: 5 }])
  })
})
