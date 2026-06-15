import { describe, expect, it } from 'vitest'
import { type Row, parseWhere, runQuery } from '../src/query'

const cities: Row[] = [
  { slug: 'cities/tokyo', title: 'Tokyo', population: 37000000, founded: 1457 },
  { slug: 'cities/rome', title: 'Rome', population: 2800000, founded: -753 },
  { slug: 'cities/delhi', title: 'Delhi', population: 32900000, founded: -1000 },
  { slug: 'cities/london', title: 'London', population: 9000000, founded: 47 },
]

describe('query engine', () => {
  it('parses a where expression into typed filters', () => {
    expect(parseWhere('population>5000000 and founded<1500')).toEqual([
      { field: 'population', op: '>', value: 5000000 },
      { field: 'founded', op: '<', value: 1500 },
    ])
  })

  it('filters + sorts numerically (not lexically)', () => {
    const r = runQuery(cities, { where: 'population>5000000', sort: '-population' })
    expect(r.rows.map((c) => c.title)).toEqual(['Tokyo', 'Delhi', 'London'])
    expect(r.count).toBe(3)
  })

  it('handles negative (BCE) years', () => {
    const r = runQuery(cities, { where: 'founded<0', sort: 'founded' })
    expect(r.rows.map((c) => c.title)).toEqual(['Delhi', 'Rome'])
  })

  it('limit + select project the returned rows but count stays full', () => {
    const r = runQuery(cities, { sort: '-population', limit: 2, select: ['title'] })
    expect(r.rows).toEqual([{ title: 'Tokyo' }, { title: 'Delhi' }])
    expect(r.count).toBe(4)
  })

  it('computes aggregates over the full match', () => {
    const r = runQuery(cities, { agg: 'count,max:population,min:founded' })
    expect(r.aggregates).toEqual({ count: 4, 'max:population': 37000000, 'min:founded': -1000 })
  })

  it('contains (~) does case-insensitive substring match', () => {
    const r = runQuery(cities, { where: 'title~lon' })
    expect(r.rows.map((c) => c.slug)).toEqual(['cities/london'])
  })
})
