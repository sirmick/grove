import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitCommitAll, publish, publishStatus } from '../src/node'

// Publish = `git push`, so every test here runs against a real bare repo on disk: a push either
// lands in it or it doesn't. No network, no credentials — a bare repo in tmp is a legitimate remote.
const demo = new URL('../../../spaces/demo', import.meta.url).pathname

let space: string
let bare: string

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim()
}

beforeEach(() => {
  space = mkdtempSync(join(tmpdir(), 'grove-publish-'))
  cpSync(demo, space, { recursive: true, filter: (s) => !/[/\\](db|\.git)([/\\]|$)/.test(s) })
  gitCommitAll(space, 'grove: init test space') // git init + baseline commit
  bare = mkdtempSync(join(tmpdir(), 'grove-remote-'))
  git(bare, ['init', '--bare', '-q'])
})

afterEach(() => {
  rmSync(space, { recursive: true, force: true })
  rmSync(bare, { recursive: true, force: true })
})

describe('publish status', () => {
  it('reports no remote until one is configured', () => {
    const st = publishStatus(space)
    expect(st.repo).toBeTruthy()
    expect(st.remote).toBeNull()
    expect(st.publishable).toBe(false)
    expect(st.reason).toBe('no git remote configured')
  })

  it('counts every commit as unpublished while the remote has no branch yet', () => {
    git(space, ['remote', 'add', 'origin', bare])
    const st = publishStatus(space)
    expect(st.remote).toBe('origin')
    expect(st.branch).toBeTruthy()
    expect(st.ahead).toBeGreaterThan(0)
    expect(st.publishable).toBe(true)
    expect(st.reason).toBeNull()
  })

  it('is not publishable with nothing ahead', () => {
    git(space, ['remote', 'add', 'origin', bare])
    expect(publish(space).ok).toBe(true)
    const st = publishStatus(space)
    expect(st.ahead).toBe(0)
    expect(st.publishable).toBe(false)
    expect(st.reason).toBe('nothing to publish')
  })
})

describe('publish', () => {
  it('pushes the branch to the remote and sets it up to track', () => {
    git(space, ['remote', 'add', 'origin', bare])
    const branch = git(space, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const before = publishStatus(space)

    const res = publish(space)
    expect(res.ok, res.error).toBe(true)
    expect(res.pushed).toBe(before.ahead)
    expect(res.ahead).toBe(0)
    expect(res.upstream).toBe(`origin/${branch}`)

    // The commit really is in the remote, and it's the one the space is on.
    expect(git(bare, ['rev-parse', branch])).toBe(git(space, ['rev-parse', 'HEAD']))
  })

  it('publishes only what was committed, and picks up later commits', () => {
    git(space, ['remote', 'add', 'origin', bare])
    publish(space)

    // An uncommitted edit is invisible to the remote and doesn't make the space publishable.
    writeFileSync(join(space, 'notes/pub-uncommitted.md'), '# Uncommitted\n\nbody\n')
    const dirty = publishStatus(space)
    expect(dirty.uncommitted).toBeGreaterThan(0)
    expect(dirty.publishable).toBe(false)

    // Commit it and it becomes exactly one commit to publish.
    gitCommitAll(space, 'grove: add uncommitted note')
    expect(publishStatus(space).ahead).toBe(1)
    const res = publish(space)
    expect(res.ok, res.error).toBe(true)
    expect(res.pushed).toBe(1)
    expect(git(bare, ['log', '-1', '--format=%s', 'HEAD'])).toBe('grove: add uncommitted note')
  })

  it('reports a rejected push instead of throwing, leaving the space untouched', () => {
    git(space, ['remote', 'add', 'origin', bare])
    publish(space)
    const head = git(space, ['rev-parse', 'HEAD'])

    // Advance the remote behind our back, then commit locally → a non-fast-forward push.
    const other = mkdtempSync(join(tmpdir(), 'grove-other-'))
    git(other, ['clone', '-q', bare, '.'])
    writeFileSync(join(other, 'other.md'), '# Other\n')
    git(other, ['add', '-A'])
    git(other, ['commit', '-q', '-m', 'other: divergent commit'])
    git(other, ['push', '-q'])
    writeFileSync(join(space, 'notes/pub-local.md'), '# Local\n\nbody\n')
    gitCommitAll(space, 'grove: local commit')

    const res = publish(space)
    expect(res.ok).toBe(false)
    expect(res.error ?? '').toMatch(/reject|fetch first|non-fast-forward/i)
    // The local history is exactly as it was — a failed publish is not a rollback situation.
    expect(git(space, ['rev-parse', 'HEAD~1'])).toBe(head)
    rmSync(other, { recursive: true, force: true })
  })

  it('refuses to publish with no remote', () => {
    const res = publish(space)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('no git remote configured')
  })
})
