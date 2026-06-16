import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commitChangeset, gitCommitAll, gitHooksStatus, headCommit } from '../src/node'

const demo = new URL('../../../spaces/demo', import.meta.url).pathname

let space: string

function plainGit(cwd: string, args: string[]) {
  execFileSync('git', ['-c', 'user.email=plain@local', '-c', 'user.name=plain', ...args], {
    cwd,
    stdio: 'ignore',
  })
}

beforeEach(() => {
  // Fresh git-backed copy of demo (sans db/.git) per test, so transactions are isolated.
  space = mkdtempSync(join(tmpdir(), 'grove-change-'))
  cpSync(demo, space, {
    recursive: true,
    filter: (s) => !/[/\\](db|\.git)([/\\]|$)/.test(s),
  })
  gitCommitAll(space, 'grove: init test space') // git init + a real baseline commit
  expect(gitHooksStatus(space).installed).toBe(true)
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
    expect(readFileSync(join(space, 'README.md'), 'utf8')).toContain('## Recent Changes')
    expect(readFileSync(join(space, 'README.md'), 'utf8')).toContain('grove: add note')
    expect(readFileSync(join(space, 'notes/README.md'), 'utf8')).toContain(
      '[From Change](from-change.md)',
    )
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

  it('plain git commit synthesizes README files and respins', () => {
    writeFileSync(
      join(space, '_grove/overview.md'),
      '# Direct Overview\n\nThis came through plain git.\n',
    )
    plainGit(space, ['add', '_grove/overview.md'])
    plainGit(space, ['commit', '-m', 'direct overview update'])

    const readme = readFileSync(join(space, 'README.md'), 'utf8')
    expect(readme).toContain('# Direct Overview')
    expect(readme).toContain('direct overview update')
    const meta = JSON.parse(readFileSync(join(space, 'db/meta.json'), 'utf8')) as {
      headCommit: string
    }
    expect(meta.headCommit).toBe(headCommit(space))
  })

  it('grove commits still work when .git/hooks is not writable', () => {
    const hooks = join(space, '.git/hooks')
    rmSync(join(hooks, 'post-commit'), { force: true })
    chmodSync(hooks, 0o555)

    try {
      const before = headCommit(space)
      writeFileSync(join(space, 'notes/protected-hooks.md'), '# Protected Hooks\n\n**Tags:** x\n')
      const after = gitCommitAll(space, 'add note with protected hooks')

      expect(after).not.toBe(before)
      expect(readFileSync(join(space, 'README.md'), 'utf8')).toContain(
        'add note with protected hooks',
      )
      expect(readFileSync(join(space, 'notes/README.md'), 'utf8')).toContain(
        '[Protected Hooks](protected-hooks.md)',
      )
      const meta = JSON.parse(readFileSync(join(space, 'db/meta.json'), 'utf8')) as {
        headCommit: string
      }
      expect(meta.headCommit).toBe(after)
    } finally {
      chmodSync(hooks, 0o755)
    }
  })

  it('initializes a standalone space before its first changeset transaction', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'grove-fresh-'))
    try {
      cpSync(demo, fresh, {
        recursive: true,
        filter: (s) => !/[/\\](db|\.git)([/\\]|$)/.test(s),
      })
      const res = commitChangeset(
        fresh,
        { 'notes/first.md': '# First\n\n**Tags:** x\n\nhello\n' },
        'first transaction',
      )

      expect(res.ok).toBe(true)
      expect(headCommit(fresh)).not.toBe('dev')
      expect(readFileSync(join(fresh, 'notes/README.md'), 'utf8')).toContain('[First](first.md)')
    } finally {
      rmSync(fresh, { recursive: true, force: true })
    }
  })
})

describe('managed in-repo space', () => {
  let repo: string
  let sub: string

  beforeEach(() => {
    // An enclosing repo that TRACKS a space at <repo>/content (no nested .git there).
    repo = mkdtempSync(join(tmpdir(), 'grove-encl-'))
    sub = join(repo, 'content')
    cpSync(demo, sub, { recursive: true, filter: (s) => !/[/\\](db|\.git)([/\\]|$)/.test(s) })
    gitCommitAll(repo, 'init enclosing repo') // inits the enclosing repo, tracks content/
    expect(gitHooksStatus(sub).installed).toBe(true)
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('commits to the enclosing repo at the subpath — no nested repo, scoped metadata', () => {
    const before = headCommit(sub)
    const res = commitChangeset(
      sub,
      { 'notes/managed.md': '# Managed\n\n**Tags:** x\n\nhi\n' },
      'add managed note',
    )
    expect(res.ok).toBe(true)
    expect(existsSync(join(sub, '.git'))).toBe(false) // never nested a repo inside the space
    expect(existsSync(join(sub, 'notes/managed.md'))).toBe(true)
    expect(readFileSync(join(sub, 'notes/README.md'), 'utf8')).toContain('[Managed](managed.md)')
    expect(res.headCommit).not.toBe(before)
    expect(headCommit(sub)).toBe(res.headCommit) // headCommit scoped to the subpath
  })

  it('plain git commit in the enclosing repo prepares the affected space', () => {
    writeFileSync(
      join(sub, '_grove/overview.md'),
      '# Managed Overview\n\nThis came through plain git in the parent repo.\n',
    )
    plainGit(repo, ['add', 'content/_grove/overview.md'])
    plainGit(repo, ['commit', '-m', 'managed overview update'])

    expect(readFileSync(join(sub, 'README.md'), 'utf8')).toContain('# Managed Overview')
    expect(readFileSync(join(sub, 'db/meta.json'), 'utf8')).toContain(headCommit(sub))
  })
})
