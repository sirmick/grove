import { cpSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveSchema } from '@grove/core'
import { loadCorpusFromDir } from '@grove/core/node'
import { describe, expect, it } from 'vitest'
import { type Llm, ingestSource, toJsonSchema } from '../src/index'

const demo = fileURLToPath(new URL('../../../spaces/demo', import.meta.url))

describe('ingest', () => {
  it('builds a JSON schema with title/body + declared fields', () => {
    const js = toJsonSchema(resolveSchema(loadCorpusFromDir(demo), 'papers')) as {
      properties: Record<string, unknown>
    }
    expect(js.properties.title).toBeDefined()
    expect(js.properties.body).toBeDefined()
    expect(js.properties.authors).toBeDefined()
  })

  it('ingests to a review draft with provenance (stubbed llm)', async () => {
    const tmp = fileURLToPath(new URL('../../../.ingest-test', import.meta.url))
    rmSync(tmp, { recursive: true, force: true })
    cpSync(demo, tmp, { recursive: true, filter: (s) => !/[/\\](db|\.git)([/\\]|$)/.test(s) })

    const stub: Llm = async () => ({
      title: 'Test Paper',
      body: 'A concise summary.',
      authors: 'Doe et al.',
      year: 2020,
      tags: 'x',
    })
    const r = await ingestSource({
      spaceDir: tmp,
      source: 'https://example.com/p',
      collection: 'papers',
      llm: stub,
      fetchText: async () => 'raw source text',
    })

    expect(r).toEqual({ slug: 'papers/test-paper', status: 'review' })
    const md = readFileSync(`${tmp}/papers/test-paper.md`, 'utf8')
    expect(md).toContain('_status: review')
    expect(md).toContain('_source: https://example.com/p')
    expect(md).toContain('_model: claude-opus-4-8')
    expect(md).toContain('# Test Paper')
    expect(md).toContain('**Authors:** Doe et al.')
    expect(md).toContain('A concise summary.')

    rmSync(tmp, { recursive: true, force: true })
  })
})
