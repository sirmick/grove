<script lang="ts">
  import { FitAddon } from '@xterm/addon-fit'
  import { Terminal } from '@xterm/xterm'
  import '@xterm/xterm/css/xterm.css'
  import { onMount } from 'svelte'

  let host: HTMLDivElement
  const SESSION_KEY = 'grove:terminal-session:v1'

  onMount(() => {
    const term = new Terminal({
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#0b0d12', foreground: '#d8dee9' },
      cursorBlink: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const sessionId = terminalSessionId()
    let ws: WebSocket | undefined
    let closed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectDelay = 500

    const resize = () => `r${JSON.stringify({ cols: term.cols, rows: term.rows })}`
    const send = (s: string) => ws?.readyState === WebSocket.OPEN && ws.send(s)
    const connectedOrConnecting = () =>
      ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING

    function scheduleReconnect() {
      if (closed || reconnectTimer || connectedOrConnecting()) return
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        connect()
      }, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, 10000)
    }

    function connect() {
      if (closed || connectedOrConnecting()) return
      const socket = new WebSocket(`${proto}://${location.host}/pty?sid=${sessionId}`)
      ws = socket
      socket.binaryType = 'arraybuffer'
      socket.onmessage = (e) => {
        if (ws !== socket) return
        term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer))
      }
      socket.onopen = () => {
        if (ws !== socket) return
        reconnectDelay = 500
        send(resize())
      }
      socket.onclose = () => {
        if (ws !== socket) return
        ws = undefined
        scheduleReconnect()
      }
      socket.onerror = () => socket.close()
    }

    connect()
    term.onData((d) => send(`i${d}`))

    const ro = new ResizeObserver(() => {
      fit.fit()
      send(resize())
    })
    ro.observe(host)

    const reconnectIfNeeded = () => {
      if (!connectedOrConnecting()) scheduleReconnect()
    }
    window.addEventListener('online', reconnectIfNeeded)
    window.addEventListener('pageshow', reconnectIfNeeded)
    document.addEventListener('visibilitychange', reconnectIfNeeded)

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      window.removeEventListener('online', reconnectIfNeeded)
      window.removeEventListener('pageshow', reconnectIfNeeded)
      document.removeEventListener('visibilitychange', reconnectIfNeeded)
      ro.disconnect()
      ws?.close()
      term.dispose()
    }
  })

  function terminalSessionId(): string {
    const existing = localStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(SESSION_KEY, id)
    return id
  }
</script>

<div class="term" bind:this={host}></div>

<style>
  .term {
    height: 100%;
    width: 100%;
  }
</style>
