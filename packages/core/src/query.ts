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

const CLAUSE_RE = /^([\w.-]+)\s*(>=|<=|!=|~|=|>|<)\s*(.+)$/

// Split on ` and ` but not inside quotes, so `title~"rock and roll"` stays one clause. The split
// runs against a quote-masked copy, then slices are taken from the original.
function splitClauses(expr: string): string[] {
  const masked = maskQuoted(expr)
  const parts: string[] = []
  let last = 0
  for (const m of masked.matchAll(/\s+and\s+/gi)) {
    if (m.index === undefined) continue
    parts.push(expr.slice(last, m.index))
    last = m.index + m[0].length
  }
  parts.push(expr.slice(last))
  return parts
}

// Blank the *contents* of quoted spans (keeping the quotes and length) so a separator scan can't
// match a keyword that lives inside a value.
function maskQuoted(s: string): string {
  const out = s.split('')
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = ''
      else out[i] = ' '
    } else if (c === '"' || c === "'") quote = c
  }
  return out.join('')
}

export function parseWhere(expr: string): Filter[] {
  return splitClauses(expr)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((clause) => {
      const m = clause.match(CLAUSE_RE)
      if (!m?.[1] || !m[2] || m[3] === undefined) throw new Error(`bad filter: "${clause}"`)
      return { field: m[1], op: m[2] as QueryOp, value: parseValue(m[3]) }
    })
}

const AGG_FNS = new Set<AggFn>(['count', 'sum', 'avg', 'min', 'max'])

export function parseAgg(expr: string): Aggregate[] {
  return expr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tok) => {
      const [fn, field] = tok.split(':').map((x) => x.trim())
      if (!fn || !AGG_FNS.has(fn as AggFn)) throw new Error(`unknown aggregate: "${tok}"`)
      return { fn: fn as AggFn, field: field || undefined }
    })
}

// A value that looks numeric (a number, or a string of only digits/decimal/sign) → its number, so
// a string-typed column still compares numerically against a numeric filter.
function asNumber(x: unknown): number | undefined {
  if (typeof x === 'number') return Number.isNaN(x) ? undefined : x
  if (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x.trim())) return Number(x)
  return undefined
}

function cmp(a: unknown, b: unknown): number {
  const na = asNumber(a)
  const nb = asNumber(b)
  if (na !== undefined && nb !== undefined) return na - nb
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : -1
  if (b === undefined || b === null) return 1
  return String(a).localeCompare(String(b))
}

function looseEq(a: unknown, b: unknown): boolean {
  const na = asNumber(a)
  const nb = asNumber(b)
  if (na !== undefined && nb !== undefined) return na === nb
  return String(a).toLowerCase() === String(b).toLowerCase()
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.field]
  // A row that has no value for the field never satisfies a comparison/order filter (a typo'd or
  // absent field should match nothing here rather than every row).
  const absent = v === undefined || v === null || v === ''
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
      return !absent && cmp(v, f.value) > 0
    case '>=':
      return !absent && cmp(v, f.value) >= 0
    case '<':
      return !absent && cmp(v, f.value) < 0
    case '<=':
      return !absent && cmp(v, f.value) <= 0
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
