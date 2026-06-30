<script lang="ts">
  // One xterm pane bound to a server PTY session (sid). Owns: connection + graceful reconnect with
  // backoff, copy-on-select + key/menu copy-paste (wash semantics), and a refit when it becomes the
  // active (visible) tab — panes are kept mounted under display:none so scrollback survives switching,
  // which means a hidden pane has zero size and must refit on show. The parent owns the tab list.
  import { FitAddon } from '@xterm/addon-fit'
  import { Terminal as XTerm } from '@xterm/xterm'
  import '@xterm/xterm/css/xterm.css'
  import { onMount } from 'svelte'
  import { copyText, pasteText } from '../clipboard'
  import { theme } from '../theme.svelte'
  import { setTermTitle } from './terminals.svelte'

  // xterm draws on a canvas, so it can't read CSS vars directly — pull the current --term-* token
  // values off <html> and hand them to xterm. Re-read whenever the theme flips.
  function xtermTheme() {
    const s = getComputedStyle(document.documentElement)
    const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
    return {
      background: v('--term-bg', '#0b0d12'),
      foreground: v('--term-fg', '#d8dee9'),
      cursor: v('--accent', '#4ec9a8'),
    }
  }

  let {
    sid,
    active = true,
    onTabKey,
  }: { sid: string; active?: boolean; onTabKey?: (e: KeyboardEvent) => boolean } = $props()

  let host: HTMLDivElement
  let term: XTerm | undefined
  let fit: FitAddon | undefined
  let sendResize: () => void = () => {}
  let menu = $state<{ x: number; y: number } | null>(null)
  let hasSel = $state(false)

  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent)

  // Re-skin the live terminal when the theme flips (xterm applies theme changes immediately).
  $effect(() => {
    theme.current // track
    if (term) term.options.theme = xtermTheme()
  })

  // Refit + focus whenever this pane becomes visible (it had 0×0 while hidden). Guard against the
  // degenerate size so a still-collapsed container doesn't corrupt xterm's reflow.
  $effect(() => {
    if (!active || !term || !fit) return
    requestAnimationFrame(() => {
      if (!term || !fit || host.clientWidth < 10 || host.clientHeight < 10) return
      fit.fit()
      sendResize()
      term.focus()
    })
  })

  function doCopy(): boolean {
    const sel = term?.getSelection()
    if (sel) {
      copyText(sel)
      return false
    }
    return true
  }
  async function doPaste() {
    const text = await pasteText()
    if (text && term) term.paste(text)
  }

  function handleKey(ev: KeyboardEvent): boolean {
    if (ev.type !== 'keydown') return true
    const k = ev.key.toLowerCase()
    if (k === 'c') {
      if (ev.ctrlKey && ev.shiftKey) return doCopy()
      if (isMac && ev.metaKey && !ev.ctrlKey) return doCopy()
      // Plain Ctrl+C: copy when there's a selection (then clear, so a second press is SIGINT),
      // else let it through as the interrupt.
      if (!isMac && ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey) {
        const sel = term?.getSelection()
        if (sel) {
          copyText(sel)
          term?.clearSelection()
          return false
        }
        return true
      }
    }
    if (k === 'v' && ((ev.ctrlKey && ev.shiftKey) || (isMac && ev.metaKey && !ev.ctrlKey))) {
      void doPaste()
      return false
    }
    return onTabKey ? onTabKey(ev) : true
  }

  function menuCopy() {
    const sel = term?.getSelection()
    if (sel) copyText(sel)
    menu = null
  }
  function menuPaste() {
    term?.focus()
    void doPaste()
    menu = null
  }

  onMount(() => {
    const t = new XTerm({
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: xtermTheme(),
      cursorBlink: true,
    })
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(host)
    f.fit()
    term = t
    fit = f
    t.onTitleChange((title) => setTermTitle(sid, title))
    t.attachCustomKeyEventHandler(handleKey)

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket | undefined
    let closed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectDelay = 500

    const resize = () => `r${JSON.stringify({ cols: t.cols, rows: t.rows })}`
    const send = (s: string) => ws?.readyState === WebSocket.OPEN && ws.send(s)
    sendResize = () => send(resize())
    const connectedOrConnecting = () =>
      ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING

    function scheduleReconnect() {
      if (closed || reconnectTimer || connectedOrConnecting()) return
      if (document.hidden) return // don't churn reconnects while the tab is backgrounded
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        connect()
      }, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, 10000)
    }

    function connect() {
      if (closed || connectedOrConnecting()) return
      const socket = new WebSocket(`${proto}://${location.host}/pty?sid=${encodeURIComponent(sid)}`)
      ws = socket
      socket.binaryType = 'arraybuffer'
      socket.onmessage = (e) => {
        if (ws !== socket) return
        // Server frames: 's<scrollback>' is a snapshot (reset + replay on (re)connect), 'o<data>'
        // is live output. Binary or an unprefixed string is written verbatim (legacy/defensive).
        if (typeof e.data !== 'string') {
          t.write(new Uint8Array(e.data as ArrayBuffer))
          return
        }
        const kind = e.data[0]
        const data = e.data.slice(1)
        if (kind === 's') {
          t.reset()
          if (data) t.write(data, () => t.scrollToBottom())
        } else if (kind === 'o') {
          t.write(data)
        } else {
          t.write(e.data)
        }
      }
      socket.onopen = () => {
        if (ws !== socket) return
        reconnectDelay = 500
        send(resize())
      }
      socket.onclose = (e) => {
        if (ws !== socket) return
        ws = undefined
        if (e.code === 4000 || e.code === 4001) return // replaced by a new client / tab closed
        scheduleReconnect()
      }
      socket.onerror = () => socket.close()
    }

    connect()
    t.onData((d) => send(`i${d}`))

    const ro = new ResizeObserver(() => {
      if (host.clientWidth < 10 || host.clientHeight < 10) return
      f.fit()
      send(resize())
    })
    ro.observe(host)

    const onMouseUp = (ev: MouseEvent) => {
      if (ev.button !== 0) return
      const sel = t.getSelection()
      if (sel) copyText(sel) // copy-on-select (PuTTY style), selection kept
    }
    const onCtx = (ev: MouseEvent) => {
      ev.preventDefault()
      hasSel = t.hasSelection()
      menu = { x: ev.clientX, y: ev.clientY }
    }
    const closeMenu = () => (menu = null)
    host.addEventListener('mouseup', onMouseUp)
    host.addEventListener('contextmenu', onCtx)
    window.addEventListener('click', closeMenu)

    const reconnectIfNeeded = () => {
      if (!document.hidden && !connectedOrConnecting()) scheduleReconnect()
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
      host.removeEventListener('mouseup', onMouseUp)
      host.removeEventListener('contextmenu', onCtx)
      window.removeEventListener('click', closeMenu)
      ro.disconnect()
      ws?.close()
      t.dispose()
      term = undefined
      fit = undefined
    }
  })
</script>

<div class="term" bind:this={host}></div>

{#if menu}
  <div class="ctxmenu" style="left:{menu.x}px; top:{menu.y}px" role="menu">
    <button role="menuitem" disabled={!hasSel} onclick={menuCopy}>Copy</button>
    <button role="menuitem" onclick={menuPaste}>Paste</button>
  </div>
{/if}

<style>
  .term {
    height: 100%;
    width: 100%;
  }
  .ctxmenu {
    position: fixed;
    z-index: 50;
    display: flex;
    flex-direction: column;
    min-width: 120px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px;
    box-shadow: 0 6px 20px var(--shadow);
  }
  .ctxmenu button {
    background: none;
    border: 0;
    color: var(--text);
    text-align: left;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }
  .ctxmenu button:hover:not(:disabled) {
    background: var(--panel-2);
  }
  .ctxmenu button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
