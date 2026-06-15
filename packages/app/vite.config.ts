import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// Read/write/SSE all proxy to @grove/server (same-origin for the browser → no CORS).
// Ports are env-overridable so e2e can run on dedicated ports, isolated from a dev instance.
const SERVER = process.env.GROVE_SERVER ?? 'http://localhost:5179'

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: process.env.VITE_HOST, // e.g. 0.0.0.0 to expose on the network; undefined = localhost
    port: Number(process.env.VITE_PORT ?? 5180),
    strictPort: true,
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
  },
})
