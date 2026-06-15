import { spawn } from 'node:child_process'
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
import type { IncomingMessage, Server } from 'node:http'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DbMeta } from '@grove/core'
import {
  buildSpace,
  commitChangeset,
  gitCommitAll,
  loadCorpusFromDir,
  watchSpace,
} from '@grove/core/node'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { spawn as ptySpawn } from 'node-pty'
import { type WebSocket, WebSocketServer } from 'ws'

// Repo root, independent of cwd (pnpm --filter runs us inside packages/server).
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const PORT = Number(process.env.GROVE_PORT ?? 5179)

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

const server = serve({ fetch: app.fetch, port: PORT }) as unknown as Server
process.stdout.write(
  `grove server on :${PORT} (${SINGLE ? `space ${basename(SINGLE)}` : `spaces ${SPACES_ROOTS.join(', ') || '(none)'}`}, default ${defaultSpace()})\n`,
)

// Dev tier — interactive PTY over WebSocket (xterm in the browser). Local only.
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if ((req.url ?? '').startsWith('/pty')) {
    wss.handleUpgrade(req, socket, head, (ws) => attachPty(ws, req))
  } else {
    socket.destroy()
  }
})

function attachPty(ws: WebSocket, req: IncomingMessage) {
  // Open the terminal IN the request's space, with grove + ai on PATH via our rcfile.
  const { dir } = reqSpace(req.headers.cookie)
  const pty = ptySpawn('bash', ['--rcfile', join(ROOT, 'bin/term-init.sh'), '-i'], {
    name: 'xterm-color',
    cwd: dir,
    env: { ...process.env, GROVE_SPACE: dir, GROVE_ROOT: ROOT },
    cols: 80,
    rows: 24,
  })
  pty.onData((d) => {
    if (ws.readyState === ws.OPEN) ws.send(d)
  })
  pty.onExit(() => {
    if (ws.readyState === ws.OPEN) ws.close()
  })
  ws.on('message', (raw) => {
    const s = raw.toString()
    if (s[0] === 'r') {
      try {
        const { cols, rows } = JSON.parse(s.slice(1)) as { cols: number; rows: number }
        pty.resize(cols, rows)
      } catch {
        // ignore malformed resize
      }
    } else if (s[0] === 'i') {
      pty.write(s.slice(1))
    }
  })
  ws.on('close', () => pty.kill())
}
