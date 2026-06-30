import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSpace } from '../src/node'
import type { DbMeta, RespinRecord } from '../src/types'

const demo = fileURLToPath(new URL('../../../spaces/demo', import.meta.url))

let space: string

beforeEach(() => {
  space = mkdtempSync(join(tmpdir(), 'grove-obsidian-'))
  cpSync(demo, space, {
    recursive: true,
    filter: (s) => !/[/\\](db|\.git)([/\\]|$)/.test(s),
  })
})

afterEach(() => {
  rmSync(space, { recursive: true, force: true })
})

describe('Obsidian respin output', () => {
  it('writes a derived vault and records it in respin metadata', () => {
    mkdirSync(join(space, 'db', 'obsidian'), { recursive: true })
    writeFileSync(join(space, 'db', 'obsidian', 'stale.md'), '# stale\n')

    const meta = buildSpace(space)
    const output = meta.outputs.find((o) => o.name === 'obsidian')

    expect(output).toMatchObject({
      label: 'Obsidian vault',
      kind: 'obsidian-vault',
      path: 'db/obsidian',
    })
    expect(output?.notes).toBeGreaterThan(0)
    expect(output?.files).toBe((output?.notes ?? 0) + 1)
    expect(existsSync(join(space, 'db', 'obsidian', 'stale.md'))).toBe(false)
    const welcome = readFileSync(join(space, 'db', 'obsidian', 'notes', 'welcome.md'), 'utf8')
    expect(welcome).toContain('# Welcome')
    expect(welcome).toContain('[tokyo](../capitals/tokyo.md)')
    expect(existsSync(join(space, 'db', 'obsidian', '_grove', 'overview.md'))).toBe(false)
    expect(existsSync(join(space, 'db', 'obsidian', 'notes', '_grove', 'schema.yaml'))).toBe(false)

    const diskMeta = JSON.parse(readFileSync(join(space, 'db', 'meta.json'), 'utf8')) as DbMeta
    const respins = JSON.parse(
      readFileSync(join(space, 'db', 'respins.json'), 'utf8'),
    ) as RespinRecord[]
    const lastRespin = respins[respins.length - 1]

    expect(diskMeta.outputs[0]?.name).toBe('obsidian')
    expect(lastRespin?.outputs?.[0]?.name).toBe('obsidian')
  })
})
