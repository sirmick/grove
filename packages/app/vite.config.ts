import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// Read/write/SSE proxy to @grove/server when Vite is a separate dev server. In Grove debug mode,
// Vite is mounted as middleware inside @grove/server, so Hono handles those paths directly.
// Ports are env-overridable so e2e can run on dedicated ports, isolated from a dev instance.
const SERVER = process.env.GROVE_SERVER ?? 'http://localhost:5179'
const INLINE_GROVE =
  process.env.GROVE_DEBUG === '1' ||
  process.env.GROVE_DEBUG === 'true' ||
  process.env.GROVE_DEBUG_APP === '1' ||
  process.env.GROVE_DEBUG_APP === 'true'

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: process.env.VITE_HOST, // e.g. 0.0.0.0 to expose on the network; undefined = localhost
    allowedHosts: true, // accept any Host header (LAN IPs, tunnels, custom hostnames)
    port: Number(process.env.VITE_PORT ?? 5180),
    strictPort: true,
    ...(INLINE_GROVE
      ? {}
      : {
          proxy: {
            '/corpus.json': SERVER,
            '/spaces': SERVER,
            '/db': SERVER,
            '/incoming': SERVER,
            '/commit': SERVER,
            '/screenshot': SERVER,
            '/exec': SERVER,
            '/events': SERVER,
            '/pty': { target: SERVER, ws: true },
          },
        }),
  },
})
