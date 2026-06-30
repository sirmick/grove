// Node-only: load a Corpus from disk, run git, build + write db/*, and watch for changes.
// Exposed via `@grove/core/node`. NOT exported from the browser-safe index.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import { type Corpus, baseName, isUnderGrove } from './corpus'
import { normalizeWikilinksToMarkdown } from './parse'
import { buildProjections } from './project'
import { allRecordSlugs, spaceWarnings } from './read'
import { renderReadmeFiles } from './render'
import type { DbMeta, LogEntry, OutputArtifact, RespinRecord } from './types'

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

function spawnOutput(e: unknown): string | null {
  const err = e as { status?: number; stdout?: Buffer | string; output?: unknown[] }
  if (err.status !== 0) return null
  const out = err.stdout ?? err.output?.[1]
  if (Buffer.isBuffer(out)) return out.toString('utf8')
  return typeof out === 'string' ? out : null
}

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return String(e)
}

function commandOutput(e: unknown, stream: 'stdout' | 'stderr'): string {
  const err = e as {
    stdout?: Buffer | string
    stderr?: Buffer | string
    output?: unknown[]
  }
  const value = err[stream] ?? err.output?.[stream === 'stdout' ? 1 : 2]
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim()
  return typeof value === 'string' ? value.trim() : ''
}

function gitOutput(args: string[], cwd: string): string {
  // Probe failures (rev-parse/check-ignore outside a repo) are caught by callers. When an
  // operation is not a probe, include stderr so CLI/MCP callers get a useful top-level error.
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    const out = spawnOutput(e)
    if (out !== null) return out
    const status = (e as { status?: number }).status
    const stderr = commandOutput(e, 'stderr')
    const stdout = commandOutput(e, 'stdout')
    const detail = stderr || stdout || errorMessage(e)
    throw new Error(
      `git ${args.join(' ')} failed${status === undefined ? '' : ` with status ${status}`}: ${detail}`,
    )
  }
}

function git(args: string[], cwd: string): string {
  return gitOutput(args, cwd).trim()
}

function gitRaw(args: string[], cwd: string): string {
  return gitOutput(args, cwd)
}

function repoTop(dir: string): string | null {
  try {
    return git(['rev-parse', '--show-toplevel'], dir)
  } catch {
    return null
  }
}

function gitPath(dir: string, path: string): string {
  const out = git(['rev-parse', '--git-path', path], dir)
  return isAbsolute(out) ? out : join(dir, out)
}

function hasHeadCommit(dir: string): boolean {
  try {
    git(['rev-parse', '--verify', 'HEAD'], dir)
    return true
  } catch {
    return false
  }
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
    const out = gitRaw(args, spaceDir)
    return parseLog(out, prefix)
  } catch {
    return []
  }
}

function parseStatus(out: string, prefix: string): LogEntry['changed'] {
  const changed: LogEntry['changed'] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const status = line.slice(0, 2).trim() || line.slice(0, 2)
    let p = line.slice(3)
    const rename = p.lastIndexOf(' -> ')
    if (rename >= 0) p = p.slice(rename + 4)
    if (prefix && p.startsWith(`${prefix}/`)) p = p.slice(prefix.length + 1)
    if (p.startsWith('db/')) continue
    changed.push({ status, path: p })
  }
  return changed
}

function gitStatus(spaceDir: string): LogEntry['changed'] {
  try {
    return parseStatus(git(['status', '--porcelain', '--', '.'], spaceDir), spacePrefix(spaceDir))
  } catch {
    return []
  }
}

const HOOK_BEGIN = '# BEGIN grove-managed hook'
const HOOK_END = '# END grove-managed hook'
const GROVE_BIN = fileURLToPath(new URL('../../../bin/grove', import.meta.url))

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

function upsertHook(repoDir: string, name: string, body: string) {
  const file = gitPath(repoDir, `hooks/${name}`)
  mkdirSync(dirname(file), { recursive: true })
  const block = `${HOOK_BEGIN}\n${body.trimEnd()}\n${HOOK_END}\n`
  let next: string
  if (existsSync(file)) {
    const current = readFileSync(file, 'utf8')
    const begin = current.indexOf(HOOK_BEGIN)
    const end = current.indexOf(HOOK_END)
    if (begin >= 0 && end >= begin) {
      next = `${current.slice(0, begin)}${block}${current.slice(end + HOOK_END.length).replace(/^\n/, '')}`
    } else {
      next = `${current.trimEnd()}\n\n${block}`
    }
  } else {
    next = `#!/usr/bin/env bash\nset -euo pipefail\n\n${block}`
  }
  writeFileSync(file, next)
  chmodSync(file, 0o755)
}

export function installGitHooks(dir: string): { repo: string; hooks: string[] } {
  const repo = repoTop(dir)
  if (!repo) throw new Error(`not inside a git repository: ${dir}`)
  const grove = shellQuote(process.env.GROVE_BIN ?? GROVE_BIN)
  const postCommit = `repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo"
unset $(git rev-parse --local-env-vars)
${grove} hooks post-commit >/dev/null`
  upsertHook(repo, 'post-commit', postCommit)
  return { repo, hooks: ['post-commit'] }
}

function installGitHooksBestEffort(dir: string) {
  try {
    installGitHooks(dir)
  } catch {
    // Hook installation is an integration convenience for plain `git commit`, not a prerequisite
    // for Grove's own write paths. Sandboxes may keep .git/hooks read-only while allowing normal
    // worktree edits and commits.
  }
}

export interface GitHooksStatus {
  repo: string | null
  installed: boolean
  missing: string[]
  error?: string
}

export function gitHooksStatus(dir: string): GitHooksStatus {
  const repo = repoTop(dir)
  if (!repo) {
    return {
      repo: null,
      installed: false,
      missing: ['post-commit'],
      error: `not inside a git repository: ${dir}`,
    }
  }
  const missing: string[] = []
  try {
    const hook = readFileSync(gitPath(repo, 'hooks/post-commit'), 'utf8')
    if (!hook.includes(HOOK_BEGIN) || !hook.includes('hooks post-commit')) {
      missing.push('post-commit')
    }
  } catch {
    missing.push('post-commit')
  }
  return { repo, installed: missing.length === 0, missing }
}

function splitZ(out: string): string[] {
  return out.split('\0').filter(Boolean)
}

function stagedPaths(repoDir: string): string[] {
  try {
    return splitZ(gitRaw(['diff', '--cached', '--name-only', '-z'], repoDir))
  } catch {
    return []
  }
}

function lastCommitPaths(repoDir: string): string[] {
  try {
    return splitZ(
      gitRaw(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'], repoDir),
    )
  } catch {
    return []
  }
}

function spaceRootForPath(repoDir: string, rel: string): string | null {
  const parts = rel.split('/').filter(Boolean)
  const candidates: string[] = []
  for (let i = 0; i <= parts.length; i++) {
    const dir = resolve(repoDir, ...parts.slice(0, i))
    if (existsSync(join(dir, '_grove'))) candidates.push(dir)
  }
  return (
    candidates.find((dir) => existsSync(join(dir, '_grove/prompt.md'))) ?? candidates[0] ?? null
  )
}

function affectedSpaceRoots(repoDir: string, paths: string[]): string[] {
  const roots = new Set<string>()
  for (const p of paths) {
    const root = spaceRootForPath(repoDir, p)
    if (root) roots.add(root)
  }
  return [...roots].sort()
}

function commitSubject(messageFile: string): string {
  try {
    const raw = readFileSync(messageFile, 'utf8')
    const first = raw
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .find((line) => line.trim() && !line.trimStart().startsWith('#'))
    return first ?? raw.trim() ?? 'grove: update'
  } catch {
    return 'grove: update'
  }
}

function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2))
}

function writeTextAtomic(file: string, content: string) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}

const OBSIDIAN_OUTPUT_PATH = 'db/obsidian'

function isObsidianMarkdown(rel: string): boolean {
  return rel.endsWith('.md') && !isUnderGrove(rel)
}

function isAuthoredRecordMarkdown(rel: string): boolean {
  return rel.endsWith('.md') && !isUnderGrove(rel) && baseName(rel) !== 'README.md'
}

function insideDir(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep)
}

function recordSlugSet(corpus: Corpus): Set<string> {
  return new Set(allRecordSlugs(corpus))
}

function normalizeMarkdownLinksInSpace(spaceDir: string): string[] {
  const corpus = loadCorpusFromDir(spaceDir)
  const knownSlugs = recordSlugSet(corpus)
  const changed: string[] = []
  for (const [rel, raw] of Object.entries(corpus)) {
    if (!isAuthoredRecordMarkdown(rel)) continue
    const normalized = normalizeWikilinksToMarkdown(rel.slice(0, -3), raw, knownSlugs)
    if (normalized === raw) continue
    writeTextAtomic(join(spaceDir, rel), normalized)
    changed.push(rel)
  }
  return changed
}

function writeObsidianVault(spaceDir: string, corpus: Corpus): OutputArtifact {
  const vaultDir = join(spaceDir, OBSIDIAN_OUTPUT_PATH)
  const knownSlugs = recordSlugSet(corpus)
  rmSync(vaultDir, { recursive: true, force: true })
  mkdirSync(vaultDir, { recursive: true })

  writeJson(join(vaultDir, '.obsidian', 'app.json'), {
    alwaysUpdateLinks: true,
    newFileLocation: 'current',
    useMarkdownLinks: false,
  })

  let notes = 0
  for (const rel of Object.keys(corpus).filter(isObsidianMarkdown).sort()) {
    const target = resolve(vaultDir, rel)
    if (!insideDir(vaultDir, target)) throw new Error(`invalid Obsidian output path: ${rel}`)
    writeTextAtomic(
      target,
      normalizeWikilinksToMarkdown(rel.slice(0, -3), corpus[rel] ?? '', knownSlugs),
    )
    notes += 1
  }

  return {
    name: 'obsidian',
    label: 'Obsidian vault',
    kind: 'obsidian-vault',
    path: OBSIDIAN_OUTPUT_PATH,
    files: notes + 1,
    notes,
  }
}

export interface PrepareCommitOptions {
  currentChanged?: LogEntry['changed']
  history?: LogEntry[]
}

export function prepareCommit(
  spaceDir: string,
  message: string,
  options: PrepareCommitOptions = {},
): string[] {
  const savedAt = new Date().toISOString()
  const normalized = normalizeMarkdownLinksInSpace(spaceDir)
  const corpus = loadCorpusFromDir(spaceDir)
  const files = renderReadmeFiles(corpus, {
    savedAt,
    current: {
      commit: 'current',
      at: savedAt,
      message,
      changed: options.currentChanged ?? gitStatus(spaceDir),
    },
    history: options.history ?? gitLog(spaceDir, 9),
  })
  for (const [rel, content] of Object.entries(files)) writeTextAtomic(join(spaceDir, rel), content)
  const rels = [...new Set([...normalized, ...Object.keys(files)])]
  if (rels.length) git(['add', '--', ...rels], spaceDir)
  return rels
}

export function prepareCommitForRepo(repoDir: string, messageFile: string): { spaces: string[] } {
  const repo = repoTop(repoDir) ?? repoDir
  const message = commitSubject(messageFile)
  const roots = affectedSpaceRoots(repo, stagedPaths(repo))
  for (const root of roots) prepareCommit(root, message)
  return { spaces: roots.map((root) => relative(repo, root) || '.') }
}

export function postCommitForRepo(repoDir: string): { spaces: string[] } {
  const repo = repoTop(repoDir) ?? repoDir
  const roots = affectedSpaceRoots(repo, lastCommitPaths(repo))
  const generated: string[] = []
  for (const root of roots) {
    const [current, ...history] = gitLog(root, 10)
    const relRoot = relative(repo, root).split(sep).join('/')
    const prepared = prepareCommit(root, current?.message ?? 'grove: update', {
      currentChanged: current?.changed ?? [],
      history: history.slice(0, 9),
    })
    generated.push(...prepared.map((rel) => (relRoot ? `${relRoot}/${rel}` : rel)))
  }
  const staged = new Set(stagedPaths(repo))
  const amendPaths = generated.filter((p) => staged.has(p))
  if (amendPaths.length) {
    const noHooks = join(tmpdir(), 'grove-no-hooks')
    mkdirSync(noHooks, { recursive: true })
    git(
      [
        '-c',
        `core.hooksPath=${noHooks}`,
        ...GIT_ID,
        'commit',
        '--amend',
        '--no-edit',
        '-q',
        '--only',
        '--',
        ...amendPaths,
      ],
      repo,
    )
  }
  for (const root of roots) buildSpace(root)
  return { spaces: roots.map((root) => relative(repo, root) || '.') }
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
  const outputs = [writeObsidianVault(spaceDir, corpus)]

  const respin: RespinRecord = {
    status: 'pass',
    headCommit: head,
    builtAt,
    durationMs: Date.now() - t0,
    warnings: spaceWarnings(corpus),
    error: null,
    outputs,
  }
  const meta: DbMeta = {
    headCommit: head,
    builtAt,
    respin,
    log: gitLog(spaceDir, 50),
    collections: proj.collectionEtags,
    outputs,
  }
  appendRespin(db, respin)
  writeJson(join(db, 'meta.json'), meta) // written last
  return meta
}

const GIT_ID = ['-c', 'user.email=grove@local', '-c', 'user.name=grove']

/** Make the space its own git repo on first use (gitignoring derived db/). Idempotent.
 *  No-op when the space is managed by an enclosing repo (we don't nest a repo inside one). */
export function ensureGitRepo(dir: string) {
  if (existsSync(join(dir, '.git')) || managedByEnclosing(dir)) {
    installGitHooksBestEffort(dir)
    return
  }
  try {
    git(['init', '-q'], dir)
    installGitHooksBestEffort(dir)
    writeFileSync(join(dir, '.gitignore'), 'db/\n*.tmp\n')
  } catch {
    // git unavailable; commits will no-op and headCommit falls back to 'dev'
  }
}

/** Stage + commit all pending changes in the space; returns the new HEAD. */
export function gitCommitAll(dir: string, message: string): string {
  ensureGitRepo(dir)
  const isSpace = existsSync(join(dir, '_grove'))
  if (isSpace) {
    try {
      prepareCommit(dir, message)
    } catch (e) {
      throw new Error(`failed to prepare Grove commit artifacts in ${dir}: ${errorMessage(e)}`)
    }
  }
  // For an in-repo space, scope add/commit to its subpath so it never sweeps up unrelated changes
  // elsewhere in the enclosing repo.
  const scope = managedByEnclosing(dir) ? ['--', '.'] : []
  let commitHead = ''
  try {
    const noHooks = join(tmpdir(), 'grove-no-hooks')
    mkdirSync(noHooks, { recursive: true })
    git(['add', '-A', ...scope], dir)
    git(
      [
        '-c',
        `core.hooksPath=${noHooks}`,
        ...GIT_ID,
        'commit',
        '-q',
        '-m',
        message,
        '--allow-empty',
        ...scope,
      ],
      dir,
    )
    commitHead = headCommit(dir)
  } catch (e) {
    throw new Error(`failed to create Grove git commit in ${dir}: ${errorMessage(e)}`)
  }
  if (isSpace) {
    try {
      buildSpace(dir)
    } catch (e) {
      throw new Error(
        `Grove git commit ${commitHead || '(unknown)'} was created, but respin failed in ${dir}: ${errorMessage(e)}`,
      )
    }
  }
  return commitHead || headCommit(dir)
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
  if (!managedByEnclosing(spaceDir) && !hasHeadCommit(spaceDir)) {
    gitCommitAll(spaceDir, 'grove: init space')
  }
  const id = randomUUID().slice(0, 8)
  const wt = worktreePath(id)
  mkdirSync(dirname(wt), { recursive: true })
  git(['worktree', 'add', '--quiet', '-b', `change/${id}`, wt, 'HEAD'], spaceDir)
  installGitHooksBestEffort(wt)
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

/** Commit a change: prepare generated files, commit in the worktree, BUILD there, merge, respin. */
export function commitChange(spaceDir: string, id: string, message: string): CommitResult {
  const wt = worktreePath(id)
  const branch = `change/${id}`
  try {
    try {
      prepareCommit(wt, message)
    } catch (e) {
      removeWorktree(spaceDir, id)
      return { ok: false, error: `build failed: ${(e as Error).message}` }
    }
    git(['add', '-A'], wt)
    try {
      const noHooks = join(tmpdir(), 'grove-no-hooks')
      mkdirSync(noHooks, { recursive: true })
      git(
        [
          '-c',
          `core.hooksPath=${noHooks}`,
          ...GIT_ID,
          'commit',
          '-q',
          '-m',
          message,
          '--allow-empty',
        ],
        wt,
      )
    } catch (e) {
      removeWorktree(spaceDir, id)
      return { ok: false, error: `build failed: ${(e as Error).message}` }
    }

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

/** Read the last-built db/meta.json without rebuilding. Null if the space hasn't been built yet. */
export function readMeta(spaceDir: string): DbMeta | null {
  try {
    return JSON.parse(readFileSync(join(spaceDir, 'db', 'meta.json'), 'utf8')) as DbMeta
  } catch {
    return null
  }
}

export function watchSpace(spaceDir: string, onBuild: (m: DbMeta) => void) {
  // (1) Watch db/respins.json — the single file every build rewrites — to pick up builds done by
  // *other* processes (e.g. a `grove` CLI commit): they already built, so we just read meta +
  // broadcast (rebuilding here would rewrite respins.json and loop).
  const respinWatcher = chokidar.watch(join(spaceDir, 'db', 'respins.json'), {
    ignoreInitial: true,
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const reload = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const m = readMeta(spaceDir)
      if (m) onBuild(m)
    }, 150)
  }
  respinWatcher.on('all', reload)
  respinWatcher.on('error', (e) =>
    console.warn(`watchSpace(${spaceDir}) respin watch disabled: ${(e as Error).message}`),
  )

  // (2) Watch the source tree so a raw edit on disk — terminal `echo >> notes/x.md`, an external
  // editor, `git pull` — refreshes open tabs and folders even though it never went through a build.
  // db/ is excluded so the build's own writes don't loop; .git/node_modules/.venv are excluded to
  // bound the inotify watch count. Set GROVE_NO_SOURCE_WATCH=1 to opt out on very large spaces.
  let srcWatcher: ReturnType<typeof chokidar.watch> | undefined
  if (process.env.GROVE_NO_SOURCE_WATCH !== '1') {
    const dbDir = join(spaceDir, 'db')
    srcWatcher = chokidar.watch(spaceDir, {
      ignoreInitial: true,
      ignored: (p: string) =>
        p === dbDir ||
        p.startsWith(`${dbDir}/`) ||
        /[/\\](\.git|node_modules|\.venv)([/\\]|$)/.test(p),
    })
    let rebuildTimer: ReturnType<typeof setTimeout> | undefined
    const rebuild = () => {
      if (rebuildTimer) clearTimeout(rebuildTimer)
      rebuildTimer = setTimeout(() => {
        try {
          onBuild(buildSpace(spaceDir)) // rebuild projections + journal a respin, then broadcast
        } catch (e) {
          console.warn(`watchSpace(${spaceDir}) source rebuild failed: ${(e as Error).message}`)
        }
      }, 200)
    }
    for (const ev of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) {
      srcWatcher.on(ev, rebuild)
    }
    srcWatcher.on('error', (e) =>
      console.warn(`watchSpace(${spaceDir}) source watch disabled: ${(e as Error).message}`),
    )
  }

  // Return a handle that closes both watchers.
  return {
    close: () => Promise.all([respinWatcher.close(), srcWatcher?.close()]).then(() => undefined),
  }
}
