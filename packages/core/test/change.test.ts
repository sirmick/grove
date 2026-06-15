import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commitChangeset, gitCommitAll, headCommit } from '../src/node'

const demo = new URL('../../../spaces/demo', import.meta.url).pathname

let space: string

beforeEach(() => {
  // Fresh git-backed copy of demo (sans db/.git) per test, so transactions are isolated.
  space = mkdtempSync(join(tmpdir(), 'grove-change-'))
  cpSync(demo, space, {
    recursive: true,
    filter: (s) => !/[/\\](db|\.git)([/\\]|$)/.test(s),
  })
  gitCommitAll(space, 'grove: init test space') // git init + a real baseline commit
})

afterEach(() => {
  rmSync(space, { recursive: true, force: true })
})

describe('change transaction (mechanism a)', () => {
  it('happy path: builds in the worktree, merges, respins, advances HEAD', () => {
    const before = headCommit(space)
    const res = commitChangeset(
      space,
      { 'notes/from-change.md': '# From Change\n\n**Tags:** x\n\nhello\n' },
      'grove: add note',
    )

    expect(res.ok).toBe(true)
    expect(res.headCommit).not.toBe(before)
    expect(res.headCommit).toBe(headCommit(space))
    expect(existsSync(join(space, 'notes/from-change.md'))).toBe(true)
    expect(readFileSync(join(space, 'notes/from-change.md'), 'utf8')).toContain('From Change')
  })

  it('validate-before-merge: a broken build is rejected and main is untouched', () => {
    const before = headCommit(space)
    const res = commitChangeset(
      space,
      { 'notes/_grove/schema.yaml': 'fields: [unterminated\n' }, // invalid YAML → build throws
      'grove: break schema',
    )

    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/build failed/)
    expect(headCommit(space)).toBe(before) // never merged
    // the bad file did not land on main
    expect(readFileSync(join(space, 'notes/_grove/schema.yaml'), 'utf8')).not.toContain(
      'unterminated',
    )
  })
})
