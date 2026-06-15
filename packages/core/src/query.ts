// Pure query engine over projection rows (typed columns from bold-label extraction). One engine,
// every face: the CLI/JS `grove.query.run` op and the FE collection page both run this — identical
// semantics, no eval, browser-safe. Rows are plain objects (RecordRow + extracted fields).

export type Row = Record<string, unknown>
export type QueryOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | '~'
export type AggFn = 'count' | 'sum' | 'avg' | 'min' | 'max'

export interface Filter {
  field: string
  op: QueryOp
  value: string | number | boolean
}
export interface Aggregate {
  fn: AggFn
  field?: string
}

export interface Query {
  where?: string | Filter[] // "population>5000000 and founded<1500"
  sort?: string // "field" asc, "-field" desc
  select?: string[]
  limit?: number
  agg?: string | Aggregate[] // "avg:pe,max:marketCap,count"
  groupBy?: string
}

export interface QueryResult {
  rows: Row[]
  count: number // matched rows, before limit
  aggregates?: Record<string, number | null>
  groups?: Array<{ key: unknown; count: number; aggregates: Record<string, number | null> }>
}

function parseValue(raw: string): string | number | boolean {
  const s = raw.trim().replace(/^["']|["']$/g, '')
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (/^(true|false)$/i.test(s)) return /^true$/i.test(s)
  return s
}

const CLAUSE_RE = /^([\w.]+)\s*(>=|<=|!=|~|=|>|<)\s*(.+)$/

export function parseWhere(expr: string): Filter[] {
  return expr
    .split(/\s+and\s+/i)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((clause) => {
      const m = clause.match(CLAUSE_RE)
      if (!m?.[1] || !m[2] || m[3] === undefined) throw new Error(`bad filter: "${clause}"`)
      return { field: m[1], op: m[2] as QueryOp, value: parseValue(m[3]) }
    })
}

export function parseAgg(expr: string): Aggregate[] {
  return expr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tok) => {
      const [fn, field] = tok.split(':').map((x) => x.trim())
      return { fn: fn as AggFn, field: field || undefined }
    })
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : -1
  if (b === undefined || b === null) return 1
  return String(a).localeCompare(String(b))
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b
  return String(a).toLowerCase() === String(b).toLowerCase()
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.field]
  switch (f.op) {
    case '=':
      return looseEq(v, f.value)
    case '!=':
      return !looseEq(v, f.value)
    case '~':
      return String(v ?? '')
        .toLowerCase()
        .includes(String(f.value).toLowerCase())
    case '>':
      return cmp(v, f.value) > 0
    case '>=':
      return cmp(v, f.value) >= 0
    case '<':
      return cmp(v, f.value) < 0
    case '<=':
      return cmp(v, f.value) <= 0
  }
}

function computeAggs(rows: Row[], aggs: Aggregate[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const a of aggs) {
    const key = a.field ? `${a.fn}:${a.field}` : a.fn
    if (a.fn === 'count') {
      out[key] = rows.length
      continue
    }
    if (!a.field) {
      out[key] = null
      continue
    }
    const nums = rows
      .map((r) => r[a.field as string])
      .filter((n): n is number => typeof n === 'number')
    if (!nums.length) {
      out[key] = null
      continue
    }
    switch (a.fn) {
      case 'sum':
        out[key] = nums.reduce((x, y) => x + y, 0)
        break
      case 'avg':
        out[key] = nums.reduce((x, y) => x + y, 0) / nums.length
        break
      case 'min':
        out[key] = Math.min(...nums)
        break
      case 'max':
        out[key] = Math.max(...nums)
        break
    }
  }
  return out
}

export function runQuery(rows: Row[], q: Query): QueryResult {
  const filters = !q.where ? [] : typeof q.where === 'string' ? parseWhere(q.where) : q.where
  let matched = rows.filter((r) => filters.every((f) => matches(r, f)))

  if (q.sort) {
    const desc = q.sort.startsWith('-')
    const field = desc ? q.sort.slice(1) : q.sort
    matched = [...matched].sort((a, b) => (desc ? -1 : 1) * cmp(a[field], b[field]))
  }

  const result: QueryResult = { rows: matched, count: matched.length }

  const aggs = !q.agg ? [] : typeof q.agg === 'string' ? parseAgg(q.agg) : q.agg
  if (aggs.length) {
    if (q.groupBy) {
      const groups = new Map<unknown, Row[]>()
      for (const r of matched) {
        const k = r[q.groupBy]
        const bucket = groups.get(k)
        if (bucket) bucket.push(r)
        else groups.set(k, [r])
      }
      result.groups = [...groups.entries()].map(([key, rs]) => ({
        key,
        count: rs.length,
        aggregates: computeAggs(rs, aggs),
      }))
    } else {
      result.aggregates = computeAggs(matched, aggs)
    }
  }

  // limit + projection apply to the returned rows only — aggregates already cover the full match.
  let out = q.limit != null ? matched.slice(0, q.limit) : matched
  if (q.select?.length) {
    const cols = q.select
    out = out.map((r) => Object.fromEntries(cols.map((k) => [k, r[k]])))
  }
  result.rows = out
  return result
}
