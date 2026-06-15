<script lang="ts">
  import { FitAddon } from '@xterm/addon-fit'
  import { Terminal } from '@xterm/xterm'
  import '@xterm/xterm/css/xterm.css'
  import { onMount } from 'svelte'

  let host: HTMLDivElement

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
    const ws = new WebSocket(`${proto}://${location.host}/pty`)
    ws.binaryType = 'arraybuffer'
    const send = (s: string) => ws.readyState === WebSocket.OPEN && ws.send(s)

    ws.onmessage = (e) =>
      term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer))
    ws.onopen = () => send(`r${JSON.stringify({ cols: term.cols, rows: term.rows })}`)
    term.onData((d) => send(`i${d}`))

    const ro = new ResizeObserver(() => {
      fit.fit()
      send(`r${JSON.stringify({ cols: term.cols, rows: term.rows })}`)
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  })
</script>

<div class="term" bind:this={host}></div>

<style>
  .term {
    height: 100%;
    width: 100%;
  }
</style>
