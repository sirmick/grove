import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
// grove server — read tier (static db/ + corpus + SSE change-feed), author tier (git commit /
// worktree transaction) and dev tier (exec + pty), with a watcher per space. Multiple spaces are
// selectable per request via the `grove_space` cookie; GROVE_SPACE forces single-space mode (e2e).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import { createRequire } from 'node:module'
import { homedir, networkInterfaces } from 'node:os'
import { basename, delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { DbMeta } from '@grove/core'
import {
  buildSpace,
  commitChangeset,
  gitCommitAll,
  loadCorpusFromDir,
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

// ── Access token ──────────────────────────────────────────────────────────────────────────────
// The dev tier exposes /exec + /pty (arbitrary command execution), so a server reachable off-box
// MUST gate access. Loopback callers are trusted (they already have the machine); everyone else
// needs the token — via ?token=<t> (which then sets a cookie), the grove_token cookie, or a Bearer
// header. Set GROVE_TOKEN to pin a value; GROVE_NO_AUTH=1 disables the check entirely.
const AUTH = process.env.GROVE_NO_AUTH !== '1'
const TOKEN = process.env.GROVE_TOKEN || randomBytes(16).toString('hex')

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
  if (!exposed) return [`http://${HOST}:${PORT}${q}`]
  const urls = [`http://localhost:${PORT}${q}`]
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${PORT}${q}`)
    }
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

// Resolve the request's space from the grove_space cookie (validated against the list), else default.
function spaceFromCookie(cookie: string | undefined): string {
  const m = /(?:^|;\s*)grove_space=([^;]+)/.exec(cookie ?? '')
  const name = m?.[1] ? decodeURIComponent(m[1]) : ''
  return name && dirOfSpace(name) ? name : defaultSpace()
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

// Lazy registry: build + watch a space on first access, then cache.
const built = new Set<string>()
function ensure(name: string): string {
  const dir = dirOfSpace(name)
  if (!dir) throw new Error(`unknown space: ${name}`)
  if (!built.has(name)) {
    buildSpace(dir)
    watchSpace(dir, (m) => broadcast(name, m))
    built.add(name)
  }
  return dir
}

const reqSpace = (cookie: string | undefined): { name: string; dir: string } => {
  const name = spaceFromCookie(cookie)
  return { name, dir: ensure(name) }
}

ensure(defaultSpace()) // build + watch the default space on boot

const app = new Hono()

// The selectable spaces + the caller's current one (resolved from the cookie).
app.get('/spaces', (c) =>
  c.json({
    spaces: listSpaces().map((s) => s.name),
    current: spaceFromCookie(c.req.header('cookie')),
  }),
)

// Read tier: the raw corpus (data; FE computes over it) and the built db/* (journal, projections).
app.get('/corpus.json', (c) => c.json(loadCorpusFromDir(reqSpace(c.req.header('cookie')).dir)))

app.get('/db/*', (c) => {
  const { dir } = reqSpace(c.req.header('cookie'))
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

// A space-relative path is safe iff it stays inside the space dir and is a markdown/yaml file.
function safeTarget(dir: string, rel: string): string | null {
  const target = resolve(dir, rel)
  if (!target.startsWith(dir + sep) || rel.includes('..') || !/\.(md|ya?ml)$/.test(rel)) {
    return null
  }
  return target
}

// Dev write endpoint. Atomic, path-safe; commits in place + respins + broadcasts.
app.put('/incoming/*', async (c) => {
  const { name, dir } = reqSpace(c.req.header('cookie'))
  const rel = decodeURIComponent(c.req.path.replace(/^\/incoming\//, ''))
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
  const { name, dir } = reqSpace(c.req.header('cookie'))
  const body = (await c.req.json()) as { message?: string; files?: Record<string, string> }
  const files = body.files ?? {}
  if (Object.keys(files).some((rel) => !safeTarget(dir, rel))) return c.text('bad path', 400)
  const res = commitChangeset(dir, files, body.message ?? 'grove: update')
  if (!res.ok) {
    return c.json({ ok: false, conflicts: res.conflicts, error: res.error }, 409)
  }
  if (res.meta) broadcast(name, res.meta)
  return c.json({ ok: true, headCommit: res.headCommit, builtAt: res.meta?.builtAt })
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
  const { dir } = reqSpace(c.req.header('cookie'))
  const { args } = (await c.req.json()) as { args?: string[] }
  if (!Array.isArray(args)) return c.text('args[] required', 400)
  return await new Promise<Response>((resolveResp) => {
    const cp = spawn('pnpm', ['-s', 'grove', ...args], {
      cwd: ROOT,
      env: { ...process.env, GROVE_SPACE: dir },
    })
    let stdout = ''
    let stderr = ''
    cp.stdout.on('data', (d) => {
      stdout += d
    })
    cp.stderr.on('data', (d) => {
      stderr += d
    })
    cp.on('close', (code) => resolveResp(c.json({ code, stdout, stderr })))
  })
})

// SSE change-feed, scoped to the request's space: a "changed" ping per respin the FE reacts to.
app.get('/events', (c) => {
  const { name } = reqSpace(c.req.header('cookie'))
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
  '/screenshot',
  '/spaces',
])
const GROVE_PREFIXES = ['/db/', '/incoming/']

function isGroveHttpRoute(url: string | undefined): boolean {
  const path = new URL(url ?? '/', 'http://localhost').pathname
  return GROVE_ROUTES.has(path) || GROVE_PREFIXES.some((prefix) => path.startsWith(prefix))
}

interface ViteServer {
  middlewares: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void
  close(): Promise<void>
}

async function createViteMiddlewareServer(server: Server): Promise<ViteServer | undefined> {
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
const server = createServer()
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
      res.setHeader('Set-Cookie', `grove_token=${TOKEN}; Path=/; SameSite=Lax; HttpOnly`)
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
  const appUrl = `http://${HOST && HOST !== '0.0.0.0' ? HOST : 'localhost'}:${PORT}`
  process.stdout.write(
    `grove ${DEBUG_APP ? 'debug stack' : 'server'} on ${appUrl} (${SINGLE ? `space ${basename(SINGLE)}` : `spaces ${SPACES_ROOTS.join(', ') || '(none)'}`}, default ${defaultSpace()})\n`,
  )
  if (AUTH) {
    printAccess('access (token required off-box) — open:\n')
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
  const { dir } = reqSpace(req.headers.cookie)
  // Open or resume the terminal IN the request's space, with grove + ai on PATH via our rcfile.
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
