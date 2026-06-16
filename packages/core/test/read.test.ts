import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadCorpusFromDir } from '../src/node'
import {
  allLinks,
  backlinks,
  buildTree,
  collectionDetail,
  orphans,
  recordRead,
  recordRows,
} from '../src/read'

const demoDir = fileURLToPath(new URL('../../../spaces/demo', import.meta.url))
const corpus = loadCorpusFromDir(demoDir)

describe('read engine', () => {
  it('builds a tree of the top-level collections', () => {
    const tops = buildTree(corpus).filter((n) => n.kind === 'collection')
    expect(tops.map((n) => (n.kind === 'collection' ? n.path : ''))).toEqual([
      'capitals',
      'cities',
      'notes',
      'papers',
      'stocks',
      'trades',
    ])
  })

  it('nests capitals/japan under capitals', () => {
    const capitals = buildTree(corpus).find((n) => n.kind === 'collection' && n.path === 'capitals')
    const sub =
      capitals?.kind === 'collection'
        ? capitals.children.find((c) => c.kind === 'collection')
        : undefined
    expect(sub?.kind === 'collection' ? sub.path : '').toBe('capitals/japan')
  })

  it('extracts bold-label fields incl. inherited base + BCE year', () => {
    const rows = recordRows(corpus, 'capitals')
    const tokyo = rows.find((r) => r.slug === 'capitals/tokyo')
    expect(tokyo?.country).toBe('Japan')
    expect(tokyo?.population).toBe(14094034)
    expect(tokyo?.continent).toBe('Asia') // inherited base + own field both present
    expect(rows.find((r) => r.slug === 'capitals/seoul')?.founded).toBe(-18)
  })

  it('reads a record body', () => {
    expect(recordRead(corpus, 'capitals/tokyo')?.body).toContain('Tokyo Bay')
  })

  it('resolves links and backlinks', () => {
    expect(
      allLinks(corpus).some((l) => l.src === 'capitals/tokyo' && l.dst === 'capitals/japan/osaka'),
    ).toBe(true)
    expect(backlinks(corpus, 'trades/2026-06-10-nvda').map((l) => l.src)).toContain(
      'notes/datacenter-selloff',
    )
  })

  it('detects orphans (kyoto has no inbound links)', () => {
    expect(orphans(corpus)).toContain('capitals/kyoto')
  })

  it('marks the ingested paper as a review draft', () => {
    expect(
      recordRows(corpus, 'papers').find((r) => r.slug.endsWith('attention-is-all-you-need'))
        ?.status,
    ).toBe('review')
  })

  it('reports the collection meta manifest', () => {
    const d = collectionDetail(corpus, 'capitals')
    expect(d.manifest.templates).toContain('city.md')
    expect(d.recordCount).toBe(3)
  })

  it('does not treat generated README files as records', () => {
    const c = { ...corpus, 'notes/README.md': '# Notes\n\n| generated | table |\n' }
    expect(recordRows(c, 'notes').map((r) => r.slug)).not.toContain('notes/README')
  })
})
