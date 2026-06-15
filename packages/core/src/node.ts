// Node-only: load a Corpus from disk, run git, build + write db/*, and watch for changes.
// Exposed via `@grove/core/node`. NOT exported from the browser-safe index.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import chokidar from 'chokidar'
import type { Corpus } from './corpus'
import { buildProjections } from './project'
import { spaceWarnings } from './read'
import type { DbMeta, LogEntry, RespinRecord } from './types'

export function loadCorpusFromDir(dir: string): Corpus {
  const corpus: Corpus = {}
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue
    const parent = (e as { parentPath?: string; path?: string }).parentPath ?? e.path ?? dir
    const rel = relative(dir, join(parent, e.name)).split(sep).join('/')
    if (rel.startsWith('db/')) continue
    if (/\.(md|ya?ml)$/.test(rel)) corpus[rel] = readFileSync(join(parent, e.name), 'utf8')
  }
  return corpus
}

function git(args: string[], cwd: string): string {
  // Discard stderr: failures are expected on probes (rev-parse/check-ignore outside a repo) and are
  // handled via catch + fallbacks; we don't want git's "fatal: …" leaking to the CLI/terminal.
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function isInsideWorkTree(dir: string): boolean {
  try {
    return git(['rev-parse', '--is-inside-work-tree'], dir) === 'true'
  } catch {
    return false
  }
}

function ignoredByRepo(dir: string): boolean {
  try {
    git(['check-ignore', '-q', '.'], dir)
    return true
  } catch {
    return false
  }
}

// A space with no .git that lives inside an enclosing repo which TRACKS it (doesn't ignore it) is
// "managed" by that repo: we don't nest a repo, and its commits + git metadata are scoped to its
// subpath. (A space the enclosing repo ignores — e.g. spaces/demo — is meant to be its own repo.)
function managedByEnclosing(dir: string): boolean {
  return !existsSync(join(dir, '.git')) && isInsideWorkTree(dir) && !ignoredByRepo(dir)
}

// The space's path within its (enclosing) repo — '' when the space IS the repo root.
function spacePrefix(dir: string): string {
  try {
    return relative(git(['rev-parse', '--show-toplevel'], dir), dir)
      .split(sep)
      .join('/')
  } catch {
    return ''
  }
}

export function headCommit(dir: string): string {
  try {
    const prefix = spacePrefix(dir)
    // In-repo space → the last commit that touched it (not the repo-wide HEAD), so its "version"
    // and the journal stay local to the space rather than tracking unrelated project commits.
    if (prefix) return git(['log', '-1', '--format=%H', '--', '.'], dir) || 'dev'
    return git(['rev-parse', 'HEAD'], dir)
  } catch {
    return 'dev'
  }
}

function parseLog(out: string, prefix: string): LogEntry[] {
  const entries: LogEntry[] = []
  for (const block of out.split('\x01')) {
    if (!block.trim()) continue
    const lines = block.split('\n')
    const parts = (lines[0] ?? '').split('\x00')
    const changed: LogEntry['changed'] = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? ''
      const tab = line.indexOf('\t')
      if (tab < 0) continue
      const status = line.slice(0, 1)
      let p = line.slice(tab + 1)
      const lastTab = p.lastIndexOf('\t') // rename "old\tnew" → new
      if (lastTab >= 0) p = p.slice(lastTab + 1)
      if (prefix) {
        if (!p.startsWith(`${prefix}/`)) continue
        p = p.slice(prefix.length + 1)
      }
      if (p.startsWith('db/')) continue
      changed.push({ status, path: p })
    }
    entries.push({ commit: parts[0] ?? '', at: parts[1] ?? '', message: parts[2] ?? '', changed })
  }
  return entries
}

function gitLog(spaceDir: string, n: number): LogEntry[] {
  try {
    const top = git(['rev-parse', '--show-toplevel'], spaceDir)
    const prefix = relative(top, spaceDir).split(sep).join('/')
    const args = ['log', `-n${n}`, '--pretty=format:%x01%H%x00%cI%x00%s', '--name-status']
    if (prefix) args.push('--', '.') // in-repo space → only its commits, not the whole project's
    const out = execFileSync('git', args, { cwd: spaceDir, encoding: 'utf8' })
    return parseLog(out, prefix)
  } catch {
    return []
  }
}

function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2))
}

function appendRespin(db: string, r: RespinRecord) {
  const file = join(db, 'respins.json')
  let arr: RespinRecord[] = []
  try {
    arr = JSON.parse(readFileSync(file, 'utf8')) as RespinRecord[]
  } catch {
    arr = []
  }
  arr.push(r)
  if (arr.length > 50) arr = arr.slice(-50)
  writeJson(file, arr)
}

/** Full rebuild: load corpus → project → git-enrich → write db/* (+ journal, respins). */
export function buildSpace(spaceDir: string): DbMeta {
  const t0 = Date.now()
  const corpus = loadCorpusFromDir(spaceDir)
  const proj = buildProjections(corpus)
  const builtAt = new Date().toISOString()
  const head = headCommit(spaceDir)
  const db = join(spaceDir, 'db')

  for (const [p, rows] of Object.entries(proj.collections)) {
    for (const row of rows) {
      try {
        row.lastEdited = statSync(join(spaceDir, row.path)).mtime.toISOString()
      } catch {
        // file may be gone mid-build; leave as-is
      }
      row.gitCommit = head
    }
    writeJson(join(db, `${p}.json`), rows)
  }
  writeJson(join(db, 'links.json'), proj.links)
  writeJson(join(db, 'search.json'), { docs: proj.searchDocs })

  const respin: RespinRecord = {
    status: 'pass',
    headCommit: head,
    builtAt,
    durationMs: Date.now() - t0,
    warnings: spaceWarnings(corpus),
    error: null,
  }
  const meta: DbMeta = {
    headCommit: head,
    builtAt,
    respin,
    log: gitLog(spaceDir, 50),
    collections: proj.collectionEtags,
  }
  appendRespin(db, respin)
  writeJson(join(db, 'meta.json'), meta) // written last
  return meta
}

const GIT_ID = ['-c', 'user.email=grove@local', '-c', 'user.name=grove']

/** Make the space its own git repo on first use (gitignoring derived db/). Idempotent.
 *  No-op when the space is managed by an enclosing repo (we don't nest a repo inside one). */
export function ensureGitRepo(dir: string) {
  if (existsSync(join(dir, '.git'))) return
  if (managedByEnclosing(dir)) return
  try {
    git(['init', '-q'], dir)
    writeFileSync(join(dir, '.gitignore'), 'db/\n*.tmp\n')
    git(['add', '-A'], dir)
    git([...GIT_ID, 'commit', '-q', '-m', 'grove: init space', '--allow-empty'], dir)
  } catch {
    // git unavailable; commits will no-op and headCommit falls back to 'dev'
  }
}

/** Stage + commit all pending changes in the space; returns the new HEAD. */
export function gitCommitAll(dir: string, message: string): string {
  ensureGitRepo(dir)
  // For an in-repo space, scope add/commit to its subpath so it never sweeps up unrelated changes
  // elsewhere in the enclosing repo.
  const scope = managedByEnclosing(dir) ? ['--', '.'] : []
  try {
    git(['add', '-A', ...scope], dir)
    git([...GIT_ID, 'commit', '-q', '-m', message, '--allow-empty', ...scope], dir)
  } catch {
    // nothing to commit / git error
  }
  return headCommit(dir)
}

// ── Change transactions (mechanism a): isolate edits in a git worktree, validate the build
// there, and merge into the space's branch only if it builds cleanly and merges without conflict.

const worktreePath = (id: string) => join(tmpdir(), 'grove-work', id)

export interface Change {
  id: string
  worktree: string
  base: string
}

export interface CommitResult {
  ok: boolean
  headCommit?: string
  meta?: DbMeta
  conflicts?: string[]
  error?: string
}

/** Take out a change: a fresh worktree on a new branch off the current HEAD. */
export function beginChange(spaceDir: string): Change {
  ensureGitRepo(spaceDir)
  const id = randomUUID().slice(0, 8)
  const wt = worktreePath(id)
  mkdirSync(dirname(wt), { recursive: true })
  git(['worktree', 'add', '--quiet', '-b', `change/${id}`, wt, 'HEAD'], spaceDir)
  return { id, worktree: wt, base: headCommit(spaceDir) }
}

/** Write a file into a change's worktree (atomic). */
export function writeToChange(worktree: string, rel: string, content: string) {
  const target = join(worktree, rel)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, target)
}

function removeWorktree(spaceDir: string, id: string) {
  try {
    git(['worktree', 'remove', '--force', worktreePath(id)], spaceDir)
  } catch {
    // already gone
  }
  try {
    git(['branch', '-D', `change/${id}`], spaceDir)
  } catch {
    // already gone
  }
}

/** Commit a change: commit in the worktree, BUILD there (gate), then merge → respin → cleanup. */
export function commitChange(spaceDir: string, id: string, message: string): CommitResult {
  const wt = worktreePath(id)
  const branch = `change/${id}`
  try {
    git(['add', '-A'], wt)
    git([...GIT_ID, 'commit', '-q', '-m', message, '--allow-empty'], wt)

    // Validate-before-merge: a structural error (e.g. bad schema.yaml) fails here, main untouched.
    try {
      buildSpace(wt)
    } catch (e) {
      removeWorktree(spaceDir, id)
      return { ok: false, error: `build failed: ${(e as Error).message}` }
    }

    // Integrate into the space's branch; real git merge surfaces conflicts.
    try {
      git([...GIT_ID, 'merge', '--no-edit', branch], spaceDir)
    } catch {
      let conflicts: string[] = []
      try {
        conflicts = git(['diff', '--name-only', '--diff-filter=U'], spaceDir)
          .split('\n')
          .filter(Boolean)
      } catch {
        // ignore
      }
      try {
        git(['merge', '--abort'], spaceDir)
      } catch {
        // ignore
      }
      removeWorktree(spaceDir, id)
      return { ok: false, conflicts }
    }

    const meta = buildSpace(spaceDir)
    removeWorktree(spaceDir, id)
    return { ok: true, headCommit: meta.headCommit, meta }
  } catch (e) {
    removeWorktree(spaceDir, id)
    return { ok: false, error: (e as Error).message }
  }
}

export function abortChange(spaceDir: string, id: string) {
  removeWorktree(spaceDir, id)
}

/** One-shot transaction used by the UI Commit and CLI: begin → write files → commit. */
export function commitChangeset(
  spaceDir: string,
  files: Record<string, string>,
  message: string,
): CommitResult {
  // In-repo (managed) space: commit straight to the enclosing repo, scoped to the space — no
  // worktree (history belongs to the enclosing repo). Mirrors the /incoming write+commit+respin.
  if (managedByEnclosing(spaceDir)) {
    try {
      for (const [rel, content] of Object.entries(files)) {
        const target = join(spaceDir, rel)
        mkdirSync(dirname(target), { recursive: true })
        const tmp = `${target}.tmp`
        writeFileSync(tmp, content)
        renameSync(tmp, target)
      }
      gitCommitAll(spaceDir, message)
      const meta = buildSpace(spaceDir)
      return { ok: true, headCommit: meta.headCommit, meta }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  // Standalone space repo: the build-gated worktree transaction.
  const ch = beginChange(spaceDir)
  for (const [rel, content] of Object.entries(files)) writeToChange(ch.worktree, rel, content)
  return commitChange(spaceDir, ch.id, message)
}

/** Watch the space (excluding db/ and .git/) → debounced rebuild. Returns the watcher. */
export function watchSpace(spaceDir: string, onBuild: (m: DbMeta) => void) {
  const watcher = chokidar.watch(spaceDir, {
    ignoreInitial: true,
    ignored: (p: string) => p.includes(`${sep}db${sep}`) || p.includes(`${sep}.git${sep}`),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const rebuild = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => onBuild(buildSpace(spaceDir)), 150)
  }
  watcher.on('all', rebuild)
  return watcher
}
