import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
// grove server — read tier (static db/ + corpus + SSE change-feed), author tier (git commit /
// worktree transaction) and dev tier (exec + pty), with a watcher per space. Multiple spaces are
// selectable per request via `?space=<name>` (the grove_space cookie is only a fallback, so each
// browser tab can sit in its own space); GROVE_SPACE forces single-space mode (e2e).
import {
  type Stats,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {
  type IncomingMessage,
  type ServerResponse,
  createServer as createHttpServer,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createRequire } from 'node:module'
import { homedir, hostname, networkInterfaces } from 'node:os'
import { basename, delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { DbMeta } from '@grove/core'
import {
  buildSpace,
  commitChangeset,
  gitCommitAll,
  loadCorpusFromDir,
  publish,
  publishStatus,
  watchSpace,
} from '@grove/core/node'
import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { spawn as ptySpawn } from 'node-pty'
import { type WebSocket, WebSocketServer } from 'ws'

// Repo root, independent of cwd (pnpm --filter runs us inside packages/server).
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const APP_ROOT = join(ROOT, 'packages/app')
const PORT = Number(process.env.GROVE_PORT ?? 5179)
const HOST = process.env.GROVE_HOST
const HTTPS = process.env.GROVE_HTTPS === '1' || process.env.GROVE_HTTPS === 'true'
const PROTOCOL = HTTPS ? 'https' : 'http'

// Grove stays plain HTTP by default for local development and tests. Set GROVE_HTTPS=1 to serve
// HTTPS directly. When no certificate paths are supplied, cache a self-signed certificate under
// $XDG_CONFIG_HOME/grove/tls (or ~/.config/grove/tls) so browser trust exceptions survive restarts.
function tlsCredentials(): { cert: Buffer; key: Buffer } {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  const tlsDir = process.env.GROVE_TLS_DIR ?? join(configHome, 'grove', 'tls')
  const certPath = process.env.GROVE_TLS_CERT ?? join(tlsDir, 'cert.pem')
  const keyPath = process.env.GROVE_TLS_KEY ?? join(tlsDir, 'key.pem')
  const customPair = Boolean(process.env.GROVE_TLS_CERT || process.env.GROVE_TLS_KEY)

  if (customPair && !(process.env.GROVE_TLS_CERT && process.env.GROVE_TLS_KEY)) {
    throw new Error('GROVE_TLS_CERT and GROVE_TLS_KEY must be set together')
  }
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    if (customPair)
      throw new Error(`TLS certificate or key does not exist: ${certPath}, ${keyPath}`)
    mkdirSync(tlsDir, { recursive: true, mode: 0o700 })
    const names = new Set(['DNS:localhost', `DNS:${hostname()}`, 'IP:127.0.0.1', 'IP:::1'])
    for (const ifaces of Object.values(networkInterfaces())) {
      for (const i of ifaces ?? []) if (!i.internal) names.add(`IP:${i.address}`)
    }
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '825',
      '-subj',
      `/CN=${hostname()}`,
      '-addext',
      `subjectAltName=${[...names].join(',')}`,
    ])
    chmodSync(tlsDir, 0o700)
    chmodSync(keyPath, 0o600)
    chmodSync(certPath, 0o644)
  }
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) }
}

// ── Access token ──────────────────────────────────────────────────────────────────────────────
// The dev tier exposes /exec + /pty (arbitrary command execution), so a server reachable off-box
// MUST gate access. Loopback callers are trusted (they already have the machine); everyone else
// needs the token — via ?token=<t> (which then sets a cookie), the grove_token cookie, or a Bearer
// header. Set GROVE_TOKEN to pin a value; GROVE_NO_AUTH=1 disables the check entirely.
const AUTH = process.env.GROVE_NO_AUTH !== '1'
const TOKEN_FILE = process.env.GROVE_TOKEN_FILE

function tokenFromFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}

function resolveToken(): string {
  if (process.env.GROVE_TOKEN) return process.env.GROVE_TOKEN
  if (TOKEN_FILE) {
    const existing = tokenFromFile(TOKEN_FILE)
    if (existing) return existing
  }
  return randomBytes(16).toString('hex')
}

const TOKEN = resolveToken()

if (AUTH && TOKEN_FILE) {
  mkdirSync(dirname(TOKEN_FILE), { recursive: true, mode: 0o700 })
  writeFileSync(TOKEN_FILE, `${TOKEN}\n`, { mode: 0o600 })
  chmodSync(TOKEN_FILE, 0o600)
}

function isLoopback(req: IncomingMessage): boolean {
  const a = req.socket.remoteAddress ?? ''
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
}
function tokenEq(given: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b) // constant-time, length-guarded
}
function presentedTokens(req: IncomingMessage): string[] {
  const tokens: string[] = []
  const q = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token')
  if (q) tokens.push(q)
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) tokens.push(auth.slice(7))
  const cookie = /(?:^|;\s*)grove_token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
  if (cookie) tokens.push(cookie)
  return tokens
}
function authorized(req: IncomingMessage): boolean {
  if (!AUTH) return true
  if (isLoopback(req)) return true
  return presentedTokens(req).some((t) => tokenEq(t))
}

// Clickable access URLs (with the token, for off-box use). localhost + each LAN IPv4 when exposed.
function accessUrls(): string[] {
  const q = AUTH ? `/?token=${TOKEN}` : ''
  const exposed = !HOST || HOST === '0.0.0.0' || HOST === '::'
  if (!exposed) return [`${PROTOCOL}://${HOST}:${PORT}${q}`]
  const urls = [`${PROTOCOL}://localhost:${PORT}${q}`]
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? [])
      if (i.family === 'IPv4' && !i.internal) urls.push(`${PROTOCOL}://${i.address}:${PORT}${q}`)
  }
  return urls
}
function printAccess(prefix: string) {
  process.stdout.write(prefix)
  for (const u of accessUrls()) process.stdout.write(`  ${u}\n`)
}
const DEBUG_APP =
  process.env.GROVE_DEBUG === '1' ||
  process.env.GROVE_DEBUG === 'true' ||
  process.env.GROVE_DEBUG_APP === '1' ||
  process.env.GROVE_DEBUG_APP === 'true'

// Single-space mode when GROVE_SPACE is set (e2e); otherwise one or more roots where each subdir
// with a _grove/ is a selectable space. GROVE_SPACES_ROOTS is a path-list override.
const SINGLE = process.env.GROVE_SPACE
const DEFAULT_SPACES_ROOTS = [join(ROOT, 'spaces'), join(homedir(), 'spaces')]
function spaceRoots(): string[] {
  if (SINGLE) return []
  const roots = process.env.GROVE_SPACES_ROOTS
  if (roots) return roots.split(delimiter).filter(Boolean)
  return DEFAULT_SPACES_ROOTS
}
const SPACES_ROOTS = spaceRoots()

function listSpaces(): { name: string; dir: string }[] {
  if (SINGLE) return [{ name: basename(SINGLE), dir: SINGLE }]

  const spaces: { name: string; dir: string }[] = []
  const seen = new Set<string>()
  for (const root of SPACES_ROOTS) {
    let names: string[]
    try {
      names = readdirSync(root).filter((n) => !n.startsWith('.'))
    } catch {
      continue
    }
    for (const name of names) {
      if (seen.has(name)) continue
      const dir = join(root, name)
      try {
        if (statSync(dir).isDirectory() && existsSync(join(dir, '_grove'))) {
          spaces.push({ name, dir })
          seen.add(name)
        }
      } catch {
        // Ignore unreadable candidates.
      }
    }
  }
  return spaces
}

function defaultSpace(): string {
  const all = listSpaces()
  const env = process.env.GROVE_DEFAULT_SPACE
  if (env && all.some((s) => s.name === env)) return env
  return all[0]?.name ?? 'demo'
}

const dirOfSpace = (name: string): string | undefined =>
  listSpaces().find((s) => s.name === name)?.dir

// Resolve the request's space: the explicit `?space=` parameter first, then the grove_space cookie,
// then the default. The parameter is what makes a space per-BROWSER-TAB — the cookie is shared by
// every tab on this origin, so it can only ever be the seed a fresh tab starts from. Both are
// validated against the space list, and a malformed value (bad %xx) falls back rather than throwing.
function spaceFromCookie(cookie: string | undefined): string {
  const m = /(?:^|;\s*)grove_space=([^;]+)/.exec(cookie ?? '')
  if (!m?.[1]) return ''
  try {
    return decodeURIComponent(m[1])
  } catch {
    return ''
  }
}

function spaceFromQuery(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://localhost').searchParams.get('space') ?? ''
  } catch {
    return ''
  }
}

function spaceOf(url: string | undefined, cookie: string | undefined): string {
  const asked = spaceFromQuery(url)
  if (asked && dirOfSpace(asked)) return asked
  const seed = spaceFromCookie(cookie)
  if (seed && dirOfSpace(seed)) return seed
  return defaultSpace()
}

// Per-space SSE listeners → a respin in one space only pings clients viewing that space.
const listeners = new Map<string, Set<(data: string) => void>>()
function broadcast(space: string, m: DbMeta) {
  const set = listeners.get(space)
  if (!set) return
  const payload = JSON.stringify({
    builtAt: m.builtAt,
    headCommit: m.headCommit,
    status: m.respin.status,
  })
  for (const l of set) l(payload)
}

// Lazy registry: build + watch a space on first access, then cache. Keyed by the RESOLVED dir (not
// the name) so a same-named space appearing at a different root — e.g. after the first copy is
// deleted — is built and watched rather than served stale from a prior dir's cache.
const built = new Set<string>()
function ensure(name: string): string {
  const dir = dirOfSpace(name)
  if (!dir) throw new Error(`unknown space: ${name}`)
  if (!built.has(dir)) {
    buildSpace(dir)
    watchSpace(dir, (m) => broadcast(name, m))
    built.add(dir)
  }
  return dir
}

interface SpaceReq {
  url?: string
  header(name: 'cookie'): string | undefined
}

const reqSpace = (req: SpaceReq): { name: string; dir: string } => {
  const name = spaceOf(req.url, req.header('cookie'))
  return { name, dir: ensure(name) }
}

// Build + watch the default space on boot — but only if one exists; an empty roots set must not
// crash the server (requests then 404 until a space appears).
if (listSpaces().length > 0) ensure(defaultSpace())
else process.stdout.write('grove: no spaces found in the configured roots — nothing to serve yet\n')

const app = new Hono()

// A request naming a space that doesn't exist (an empty roots set, a space deleted under us) is a
// 404, not a server fault — ensure() throws for it and would otherwise surface as an opaque 500.
app.onError((err, c) => {
  if (err.message.startsWith('unknown space:')) return c.text(err.message, 404)
  process.stderr.write(`grove: ${err.stack ?? err.message}\n`)
  return c.text('internal error', 500)
})

// The selectable spaces + the caller's current one (resolved from the cookie).
app.get('/spaces', (c) =>
  c.json({
    spaces: listSpaces().map((s) => s.name),
    current: spaceOf(c.req.url, c.req.header('cookie')),
  }),
)

// Read tier: the raw corpus (data; FE computes over it) and the built db/* (journal, projections).
app.get('/corpus.json', (c) => c.json(loadCorpusFromDir(reqSpace(c.req).dir)))

app.get('/db/*', (c) => {
  const { dir } = reqSpace(c.req)
  const rel = c.req.path.replace(/^\/db\//, '')
  if (rel.includes('..')) return c.text('bad path', 400)
  try {
    return c.body(readFileSync(join(dir, 'db', rel), 'utf8'), 200, {
      'content-type': 'application/json',
      'cache-control': 'no-cache',
    })
  } catch {
    return c.text('not found', 404)
  }
})

// Decode a URL path segment; returns null on a malformed escape (so a bad %xx never throws and 500s).
function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

// A space-relative path is safe iff it stays inside the space dir, is a markdown/yaml file, and
// doesn't reach into git internals or the derived db/ (record markdown/yaml never lives there).
function safeTarget(dir: string, rel: string): string | null {
  const target = resolve(dir, rel)
  if (
    !target.startsWith(dir + sep) ||
    rel.includes('..') ||
    !/\.(md|ya?ml)$/.test(rel) ||
    /(^|\/)(\.git|db)(\/|$)/.test(rel)
  ) {
    return null
  }
  return target
}

// Dev write endpoint. Atomic, path-safe; commits in place + respins + broadcasts.
app.put('/incoming/*', async (c) => {
  const { name, dir } = reqSpace(c.req)
  const rel = safeDecode(c.req.path.replace(/^\/incoming\//, ''))
  if (rel === null) return c.text('bad path', 400)
  const target = safeTarget(dir, rel)
  if (!target) return c.text('bad path', 400)
  const body = await c.req.text()
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  writeFileSync(tmp, body)
  renameSync(tmp, target)
  gitCommitAll(dir, `grove: incoming ${rel}`)
  broadcast(name, buildSpace(dir))
  return c.body(null, 204)
})

// Author tier (mechanism a): apply a change set as a git-worktree transaction — isolate the edits
// on a branch, build there as a gate, then merge → respin only if it builds and merges cleanly.
// Conflicts/build failures leave main untouched and report back (drafts are kept).
app.post('/commit', async (c) => {
  const { name, dir } = reqSpace(c.req)
  const body = (await c.req.json()) as {
    message?: string
    files?: Record<string, string>
    base?: string
  }
  const files = body.files ?? {}
  if (Object.keys(files).some((rel) => !safeTarget(dir, rel))) return c.text('bad path', 400)
  // Only accept a base that looks like a git object id (or 'dev'); never let it reach git as flags.
  const base = body.base && /^[0-9a-f]{7,40}$/i.test(body.base) ? body.base : undefined
  const res = commitChangeset(dir, files, body.message ?? 'grove: update', base)
  if (!res.ok) {
    return c.json({ ok: false, conflicts: res.conflicts, error: res.error }, 409)
  }
  if (res.meta) broadcast(name, res.meta)
  return c.json({ ok: true, headCommit: res.headCommit, builtAt: res.meta?.builtAt })
})

// Author tier (mechanism c): publish — push what's been committed to the space's git remote. Read
// the state first (what the button renders), then the push itself. Both are scoped to the request's
// space; the push never touches the worktree, so a rejected one leaves everything as it was.
app.get('/publish/status', (c) => c.json(publishStatus(reqSpace(c.req).dir)))

app.post('/publish', (c) => {
  const res = publish(reqSpace(c.req).dir)
  return c.json(res, res.ok ? 200 : 409)
})

// Author tier (mechanism b): re-file — move record .md files and collection subtrees within a
// space by dragging them in the tree. Direct git mv + rebuild (mirrors /incoming; no worktree
// gate) so the move lands immediately and clients respin. Path-safe; never clobbers an existing
// target; refuses to move a collection into itself or a descendant.
interface MoveItem {
  type: 'record' | 'collection'
  id: string // record slug (no .md) or collection path
}

function insideSpace(dir: string, rel: string): boolean {
  return !rel.includes('..') && resolve(dir, rel).startsWith(dir + sep)
}

// Space-relative paths grove owns; a re-file must never move one of these, move INTO one, or touch
// anything under them (the derived db/, git internals, space/collection config, the bin scripts).
const PROTECTED_SEGMENTS = new Set(['.git', 'db', '_grove', 'bin'])
function touchesProtected(rel: string): boolean {
  return rel.split('/').some((seg) => PROTECTED_SEGMENTS.has(seg))
}

// A valid re-file destination is the space root ('') or an existing directory that is itself a real
// collection (or the space root) — never a plain file, and never db/_grove/.git/bin.
function isValidDest(dir: string, destRel: string): boolean {
  if (destRel === '') return true
  if (destRel.includes('..') || touchesProtected(destRel)) return false
  const abs = resolve(dir, destRel)
  if (!abs.startsWith(dir + sep)) return false
  try {
    return statSync(abs).isDirectory() && existsSync(join(abs, '_grove'))
  } catch {
    return false
  }
}

// Compute the on-disk {from,to} for one re-file, or null if it's invalid (escapes the space,
// missing source, would clobber, targets protected internals, or a no-op). dest is the target
// collection path ('' = root).
function moveTarget(
  dir: string,
  item: MoveItem,
  dest: string,
): { from: string; to: string } | null {
  if (item.type !== 'record' && item.type !== 'collection') return null
  const destRel = dest.replace(/^\/+|\/+$/g, '')
  if (!isValidDest(dir, destRel)) return null
  const idRel = item.id.replace(/^\/+|\/+$/g, '')
  if (!idRel || idRel.includes('..') || touchesProtected(idRel)) return null
  const base = idRel.split('/').pop() ?? idRel
  const from = item.type === 'record' ? `${idRel}.md` : idRel
  const toBase = item.type === 'record' ? `${base}.md` : base
  const to = destRel ? `${destRel}/${toBase}` : toBase
  if (from === to) return null
  if (item.type === 'collection' && (to === from || to.startsWith(`${from}/`))) return null // into self/descendant
  if (touchesProtected(to)) return null
  if (!insideSpace(dir, from) || !insideSpace(dir, to)) return null
  // The source must be the right kind: a record .md file, or a collection directory (has _grove).
  const fromAbs = resolve(dir, from)
  if (!existsSync(fromAbs) || existsSync(resolve(dir, to))) return null
  try {
    const st = statSync(fromAbs)
    if (item.type === 'record' && !st.isFile()) return null
    if (item.type === 'collection' && !(st.isDirectory() && existsSync(join(fromAbs, '_grove'))))
      return null
  } catch {
    return null
  }
  return { from, to }
}

app.post('/move', async (c) => {
  const { name, dir } = reqSpace(c.req)
  const body = (await c.req.json()) as { items?: MoveItem[]; dest?: string }
  const items = body.items ?? []
  const dest = body.dest ?? ''
  if (!items.length) return c.text('items[] required', 400)
  const moves: { from: string; to: string }[] = []
  for (const it of items) {
    const m = moveTarget(dir, it, dest)
    if (!m) return c.json({ ok: false, error: `cannot move ${it.id} → ${dest || '(root)'}` }, 400)
    moves.push(m)
  }
  // Apply atomically-ish: on any failure, roll back the renames already done so a partial move never
  // leaves the space dirty and unrebuilt.
  const done: { from: string; to: string }[] = []
  try {
    for (const m of moves) {
      mkdirSync(dirname(resolve(dir, m.to)), { recursive: true })
      renameSync(resolve(dir, m.from), resolve(dir, m.to))
      done.push(m)
    }
  } catch (e) {
    for (const m of done.reverse()) {
      try {
        renameSync(resolve(dir, m.to), resolve(dir, m.from))
      } catch {
        // best-effort rollback
      }
    }
    return c.json({ ok: false, error: `move failed: ${(e as Error).message}` }, 500)
  }
  gitCommitAll(dir, `grove: move ${moves.map((m) => `${m.from} → ${m.to}`).join(', ')}`)
  broadcast(name, buildSpace(dir))
  return c.json({ ok: true, moves })
})

// OS drag-drop upload: dropped files land in the target collection dir. Markdown/yaml become
// records (the corpus picks them up); other allowed types are stored as assets alongside them.
// Binary-safe; path-safe; one git commit + rebuild per file (mirrors /incoming).
const UPLOAD_EXT = /\.(md|markdown|ya?ml|txt|csv|tsv|json|png|jpe?g|gif|svg|webp|pdf)$/i
function safeUploadTarget(dir: string, rel: string): string | null {
  if (!insideSpace(dir, rel) || !UPLOAD_EXT.test(rel) || touchesProtected(rel)) return null
  return resolve(dir, rel)
}

app.put('/upload/*', async (c) => {
  const { name, dir } = reqSpace(c.req)
  const rel = safeDecode(c.req.path.replace(/^\/upload\//, ''))
  if (rel === null) return c.text('bad path', 400)
  const target = safeUploadTarget(dir, rel)
  if (!target) return c.text('bad path or unsupported type', 400)
  // A dropped file must never silently replace an existing record/asset — refuse and let the client
  // surface it (git is the only recovery for a clobber otherwise).
  if (existsSync(target)) return c.json({ ok: false, error: `already exists: ${rel}` }, 409)
  const buf = Buffer.from(await c.req.arrayBuffer())
  if (!buf.length) return c.text('empty body', 400)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  writeFileSync(tmp, buf)
  renameSync(tmp, target)
  gitCommitAll(dir, `grove: upload ${rel}`)
  broadcast(name, buildSpace(dir))
  return c.body(null, 204)
})

// ── bin: a raw, first-class view of <space>/bin — real OS files, executables included. Unlike the
// markdown corpus (a derived projection), this reflects the filesystem verbatim, so scripts kept
// with a space are visible, editable, and runnable (term-init puts <space>/bin first on PATH). All
// three routes are confined to <space>/bin and reject path traversal.
const binRoot = (dir: string) => join(dir, 'bin')

interface FsEntry {
  path: string // space-relative, e.g. "bin/deploy.sh"
  name: string
  dir: boolean
  exec: boolean
  size: number
}

// Names never surfaced in the bin view (build artifacts / env / VCS clutter). Dotfiles are hidden
// separately. Hidden dirs aren't recursed into, so e.g. __pycache__ never shows up or expands.
const BIN_HIDDEN_NAMES = new Set([
  '__pycache__',
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '.DS_Store',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.idea',
  '.vscode',
])
const isHiddenBinEntry = (n: string): boolean =>
  n.startsWith('.') || BIN_HIDDEN_NAMES.has(n) || /\.(pyc|pyo|class)$/.test(n)

function listBin(dir: string): FsEntry[] {
  const root = binRoot(dir)
  mkdirSync(root, { recursive: true })
  const out: FsEntry[] = []
  const walk = (abs: string, rel: string) => {
    let stats: { n: string; s: Stats }[]
    try {
      stats = readdirSync(abs)
        .filter((n) => !isHiddenBinEntry(n))
        .map((n) => ({ n, s: statSync(join(abs, n)) }))
    } catch {
      return
    }
    // directories first, then alphabetical
    stats.sort(
      (a, b) => Number(b.s.isDirectory()) - Number(a.s.isDirectory()) || a.n.localeCompare(b.n),
    )
    for (const { n, s } of stats) {
      const childRel = rel ? `${rel}/${n}` : n
      const isDir = s.isDirectory()
      out.push({
        path: `bin/${childRel}`,
        name: n,
        dir: isDir,
        exec: !isDir && (s.mode & 0o111) !== 0,
        size: isDir ? 0 : s.size,
      })
      if (isDir) walk(join(abs, n), childRel)
    }
  }
  walk(root, '')
  return out
}

// Resolve a space-relative path that must live inside <space>/bin (or be "bin" itself).
function safeBinPath(dir: string, rel: string): string | null {
  if (rel.includes('..') || !(rel === 'bin' || rel.startsWith('bin/'))) return null
  const abs = resolve(dir, rel)
  const root = binRoot(dir)
  if (abs !== root && !abs.startsWith(root + sep)) return null
  return abs
}

app.get('/fs/list', (c) => {
  const { dir } = reqSpace(c.req)
  return c.json({ entries: listBin(dir) })
})

const FS_READ_MAX = 1024 * 1024
app.get('/fs/read', (c) => {
  const { dir } = reqSpace(c.req)
  const abs = safeBinPath(dir, c.req.query('path') ?? '')
  if (!abs || !existsSync(abs)) return c.text('not found', 404)
  const st = statSync(abs)
  if (st.isDirectory()) return c.text('is a directory', 400)
  const exec = (st.mode & 0o111) !== 0
  if (st.size > FS_READ_MAX) {
    return c.json({
      path: c.req.query('path'),
      exec,
      size: st.size,
      binary: true,
      tooLarge: true,
      content: '',
    })
  }
  const buf = readFileSync(abs)
  const binary = buf.includes(0)
  return c.json({
    path: c.req.query('path'),
    exec,
    size: st.size,
    binary,
    content: binary ? '' : buf.toString('utf8'),
  })
})

app.put('/fs/write', async (c) => {
  const { name, dir } = reqSpace(c.req)
  const rel = c.req.query('path') ?? ''
  const abs = safeBinPath(dir, rel)
  if (!abs || rel === 'bin') return c.text('bad path', 400)
  const body = await c.req.text()
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body) // an existing file keeps its mode, so the executable bit survives an edit
  gitCommitAll(dir, `grove: edit ${rel}`)
  broadcast(name, buildSpace(dir)) // ping clients (bumps builtAt) so the bin view refreshes
  return c.body(null, 204)
})

// Serve raw space files so relative links/images in rendered docs actually resolve (the markdown
// renderer rewrites a doc-relative `![](pic.png)` to `/assets/<collection>/pic.png`). Read-only,
// path-confined to the space, and refuses the internals (.git, derived db/). Same auth gate as
// everything else.
const ASSET_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
}
app.get('/assets/*', (c) => {
  const { dir } = reqSpace(c.req)
  const rel = safeDecode(c.req.path.replace(/^\/assets\//, ''))
  if (rel === null || rel.includes('..')) return c.text('bad path', 400)
  const abs = resolve(dir, rel)
  if (abs !== dir && !abs.startsWith(dir + sep)) return c.text('bad path', 400)
  if (/(^|\/)(\.git|db)(\/|$)/.test(rel)) return c.text('forbidden', 403)
  try {
    if (statSync(abs).isDirectory()) return c.text('is a directory', 400)
    const ext = (rel.split('.').pop() ?? '').toLowerCase()
    return c.body(readFileSync(abs), 200, {
      'content-type': ASSET_MIME[ext] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
  } catch {
    return c.text('not found', 404)
  }
})

// Save a screenshot the FE captured (PNG bytes in the body) to <root>/screenshots/, plus a
// stable latest.png. This is the collaboration channel: the user snaps, an agent reads the file.
const SHOTS = join(ROOT, 'screenshots')
app.post('/screenshot', async (c) => {
  const buf = Buffer.from(await c.req.arrayBuffer())
  if (!buf.length) return c.text('empty body', 400)
  mkdirSync(SHOTS, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = `grove-${ts}.png`
  writeFileSync(join(SHOTS, name), buf)
  writeFileSync(join(SHOTS, 'latest.png'), buf)
  return c.text(`screenshots/${name}`)
})

// Dev tier — structured exec for AI/automation: run the grove CLI against the request's space.
app.post('/exec', async (c) => {
  const { dir } = reqSpace(c.req)
  const { args } = (await c.req.json()) as { args?: string[] }
  if (!Array.isArray(args)) return c.text('args[] required', 400)
  return await new Promise<Response>((resolveResp) => {
    const cp = spawn('pnpm', ['-s', 'grove', ...args], {
      cwd: ROOT,
      env: { ...process.env, GROVE_SPACE: dir },
    })
    const chunks: { out: Buffer[]; err: Buffer[] } = { out: [], err: [] }
    let settled = false
    const done = (r: Response) => {
      if (!settled) {
        settled = true
        resolveResp(r)
      }
    }
    cp.stdout.on('data', (d: Buffer) => chunks.out.push(d))
    cp.stderr.on('data', (d: Buffer) => chunks.err.push(d))
    // Without an 'error' handler a failed spawn (pnpm not on PATH, EACCES) never emits 'close', so
    // the promise — and the HTTP request — would hang forever. Decode as whole Buffers so multibyte
    // UTF-8 split across chunks isn't mangled.
    cp.on('error', (e) => done(c.json({ code: null, stdout: '', stderr: String(e) }, 500)))
    cp.on('close', (code) =>
      done(
        c.json({
          code,
          stdout: Buffer.concat(chunks.out).toString('utf8'),
          stderr: Buffer.concat(chunks.err).toString('utf8'),
        }),
      ),
    )
  })
})

// Close a terminal tab's PTY (the FE closed the tab). Scoped to the request's space; kills the bash
// process and drops the session so it doesn't linger until the idle sweep. No-op if already gone.
app.post('/pty-close', async (c) => {
  const { dir } = reqSpace(c.req)
  const { sid } = (await c.req.json().catch(() => ({}))) as { sid?: string }
  if (!sid || !/^[A-Za-z0-9_-]{1,80}$/.test(sid)) return c.text('sid required', 400)
  const session = ptySessions.get(sessionKey(dir, sid))
  if (session) {
    ptySessions.delete(session.key)
    if (session.idleTimer) clearTimeout(session.idleTimer)
    for (const client of [...session.clients]) {
      try {
        client.close(4001, 'closed')
      } catch {
        /* already gone */
      }
    }
    session.pty.kill()
  }
  return c.body(null, 204)
})

// SSE change-feed, scoped to the request's space: a "changed" ping per respin the FE reacts to.
app.get('/events', (c) => {
  const { name } = reqSpace(c.req)
  return streamSSE(c, async (stream) => {
    const send = (data: string) => {
      void stream.writeSSE({ event: 'changed', data })
    }
    let set = listeners.get(name)
    if (!set) {
      set = new Set()
      listeners.set(name, set)
    }
    set.add(send)
    stream.onAbort(() => {
      set?.delete(send)
    })
    while (!stream.aborted) {
      await stream.sleep(30000)
      await stream.writeSSE({ event: 'ping', data: '' })
    }
  })
})

const GROVE_ROUTES = new Set([
  '/commit',
  '/corpus.json',
  '/events',
  '/exec',
  '/move',
  '/pty-close',
  '/publish',
  '/publish/status',
  '/screenshot',
  '/spaces',
])
const GROVE_PREFIXES = ['/db/', '/incoming/', '/upload/', '/fs/', '/assets/']

function isGroveHttpRoute(url: string | undefined): boolean {
  const path = new URL(url ?? '/', 'http://localhost').pathname
  return GROVE_ROUTES.has(path) || GROVE_PREFIXES.some((prefix) => path.startsWith(prefix))
}

interface ViteServer {
  middlewares: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void
  close(): Promise<void>
}

type GroveServer = ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpsServer>

async function createViteMiddlewareServer(server: GroveServer): Promise<ViteServer | undefined> {
  if (!DEBUG_APP) return undefined
  const appRequire = createRequire(join(APP_ROOT, 'package.json'))
  const viteEntry = appRequire.resolve('vite')
  const viteModule = (await import(pathToFileURL(viteEntry).href)) as {
    createServer(config: Record<string, unknown>): Promise<ViteServer>
  }
  return viteModule.createServer({
    configFile: join(APP_ROOT, 'vite.config.ts'),
    root: APP_ROOT,
    appType: 'spa',
    server: {
      middlewareMode: { server },
      hmr: { server },
    },
  })
}

const honoRequest = getRequestListener(app.fetch)
const server = HTTPS ? createHttpsServer(tlsCredentials()) : createHttpServer()
const vite = await createViteMiddlewareServer(server)

server.on('request', (req, res) => {
  if (!authorized(req)) {
    res.statusCode = 401
    res.setHeader('content-type', 'text/plain')
    res.end('grove: unauthorized — open with ?token=<token> from the server console.\n')
    return
  }
  // Bootstrap: a valid ?token sets the grove_token cookie and redirects to a clean URL, so the
  // token isn't left in the address bar / history and later requests authenticate via the cookie.
  if (AUTH && !isLoopback(req)) {
    const u = new URL(req.url ?? '/', 'http://localhost')
    const q = u.searchParams.get('token')
    if (q && tokenEq(q)) {
      u.searchParams.delete('token')
      res.statusCode = 302
      res.setHeader(
        'Set-Cookie',
        `grove_token=${TOKEN}; Path=/; SameSite=Lax; HttpOnly${HTTPS ? '; Secure' : ''}`,
      )
      res.setHeader('Location', `${u.pathname}${u.search}${u.hash}` || '/')
      res.end()
      return
    }
  }
  if (!vite || isGroveHttpRoute(req.url)) {
    void honoRequest(req, res)
    return
  }
  vite.middlewares(req, res, (err?: unknown) => {
    if (err) {
      res.statusCode = 500
      res.end(err instanceof Error ? err.stack || err.message : String(err))
      return
    }
    void honoRequest(req, res)
  })
})

server.listen(PORT, HOST, () => {
  const appUrl = `${PROTOCOL}://${HOST && HOST !== '0.0.0.0' ? HOST : 'localhost'}:${PORT}`
  process.stdout.write(
    `grove ${DEBUG_APP ? 'debug stack' : 'server'} on ${appUrl} (${SINGLE ? `space ${basename(SINGLE)}` : `spaces ${SPACES_ROOTS.join(', ') || '(none)'}`}, default ${defaultSpace()})\n`,
  )
  if (AUTH) {
    printAccess('access (token required off-box) — open:\n')
    if (TOKEN_FILE) process.stdout.write(`token file: ${TOKEN_FILE}\n`)
    process.stdout.write('press Enter to reprint the access URL · GROVE_NO_AUTH=1 to disable\n')
    // Reprint the token URL whenever the operator hits Enter at the server console.
    if (process.stdin.isTTY) {
      process.stdin.on('data', () => printAccess('access — open:\n'))
    }
  } else {
    process.stdout.write(
      'auth disabled (GROVE_NO_AUTH=1) — anyone who can reach this host has full access\n',
    )
  }
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    const code = sig === 'SIGINT' ? 130 : 143
    void Promise.resolve(vite?.close()).finally(() => process.exit(code))
  })
}

// Dev tier — interactive PTY over WebSocket (xterm in the browser). Local only.
const wss = new WebSocketServer({ noServer: true })
// Run before Vite's HMR upgrade listener. Vite also uses a `?token=` query parameter for HMR, so
// Grove auth must validate all presented credentials before any listener writes to the socket.
server.prependListener('upgrade', (req, socket, head) => {
  if (!authorized(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  if ((req.url ?? '').startsWith('/pty')) {
    wss.handleUpgrade(req, socket, head, (ws) => attachPty(ws, req))
  } else if (!vite) {
    socket.destroy()
  }
})

const PTY_IDLE_MS = Number(process.env.GROVE_PTY_IDLE_MS ?? 24 * 60 * 60 * 1000)
const PTY_HEARTBEAT_MS = 30000
const PTY_SCROLLBACK_MAX = 128 * 1024

interface PtySession {
  key: string
  pty: ReturnType<typeof ptySpawn>
  clients: Set<WebSocket>
  scrollback: string
  idleTimer?: ReturnType<typeof setTimeout>
}

const ptySessions = new Map<string, PtySession>()

function ptySessionId(req: IncomingMessage): string {
  const url = new URL(req.url ?? '/pty', 'http://localhost')
  const sid = url.searchParams.get('sid') ?? 'default'
  return /^[A-Za-z0-9_-]{1,80}$/.test(sid) ? sid : 'default'
}

function sessionKey(dir: string, sid: string): string {
  return `${dir}\0${sid}`
}

function sendToSession(session: PtySession, data: string) {
  for (const client of [...session.clients]) {
    if (client.readyState !== client.OPEN) {
      session.clients.delete(client)
      continue
    }
    try {
      client.send(`o${data}`)
    } catch {
      session.clients.delete(client)
      client.terminate()
    }
  }
}

function schedulePtyIdleCleanup(session: PtySession) {
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.idleTimer = setTimeout(() => {
    if (session.clients.size) return
    ptySessions.delete(session.key)
    session.pty.kill()
  }, PTY_IDLE_MS)
}

function rememberPtyOutput(session: PtySession, data: string) {
  session.scrollback += data
  if (session.scrollback.length > PTY_SCROLLBACK_MAX) {
    session.scrollback = session.scrollback.slice(-PTY_SCROLLBACK_MAX)
  }
}

function ptyFor(dir: string, sid: string): PtySession {
  const key = sessionKey(dir, sid)
  const existing = ptySessions.get(key)
  if (existing) return existing

  const session: PtySession = {
    key,
    clients: new Set(),
    scrollback: '',
    pty: ptySpawn('bash', ['--rcfile', join(ROOT, 'bin/term-init.sh'), '-i'], {
      name: 'xterm-color',
      cwd: dir,
      env: { ...process.env, GROVE_SPACE: dir, GROVE_ROOT: ROOT },
      cols: 80,
      rows: 24,
    }),
  }
  session.pty.onData((d) => {
    rememberPtyOutput(session, d)
    sendToSession(session, d)
  })
  session.pty.onExit(() => {
    ptySessions.delete(session.key)
    if (session.idleTimer) clearTimeout(session.idleTimer)
    for (const client of [...session.clients]) {
      if (client.readyState === client.OPEN) client.close()
    }
    session.clients.clear()
  })
  ptySessions.set(key, session)
  return session
}

function attachPty(ws: WebSocket, req: IncomingMessage) {
  const dir = ensure(spaceOf(req.url, req.headers.cookie))
  // Open or resume the terminal IN the socket's space, with grove + ai on PATH via our rcfile.
  const session = ptyFor(dir, ptySessionId(req))
  for (const client of [...session.clients]) client.close(4000, 'replaced')
  session.clients.clear()
  session.clients.add(ws)
  if (session.idleTimer) clearTimeout(session.idleTimer)
  ws.send(`s${session.scrollback}`)

  let alive = true
  const heartbeat = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return
    if (!alive) {
      ws.terminate()
      return
    }
    alive = false
    ws.ping()
  }, PTY_HEARTBEAT_MS)

  ws.on('pong', () => {
    alive = true
  })
  ws.on('message', (raw) => {
    const s = raw.toString()
    if (s[0] === 'r') {
      try {
        const { cols, rows } = JSON.parse(s.slice(1)) as { cols: number; rows: number }
        session.pty.resize(cols, rows)
      } catch {
        // ignore malformed resize
      }
    } else if (s[0] === 'i') {
      session.pty.write(s.slice(1))
    }
  })
  ws.on('close', () => {
    clearInterval(heartbeat)
    session.clients.delete(ws)
    if (!session.clients.size) schedulePtyIdleCleanup(session)
  })
}
