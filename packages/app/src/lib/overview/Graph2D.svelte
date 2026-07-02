<script lang="ts">
  // 2D force-directed link map on a plain canvas (no WebGL). Same props/interaction as the old
  // Graph3D: nodes sized by degree + colored by collection, a spring/repulsion sim, hover to
  // highlight + select, double-click to open. Pan by dragging empty space, zoom with the wheel.
  // Rebuilds when the node/edge set changes (positions are preserved for nodes that persist), and
  // re-reads theme tokens on a theme flip.
  import { onMount } from 'svelte'
  import { theme } from '../theme.svelte'

  export interface GraphNode2D {
    slug: string
    title: string
    degree: number
    dim: boolean
    related: boolean
  }
  export interface GraphEdge2D {
    key: string
    src: string
    dst: string
    active: boolean
  }

  let {
    nodes = [],
    edges = [],
    activeSlug = '',
    onselect,
    onopen,
  }: {
    nodes?: GraphNode2D[]
    edges?: GraphEdge2D[]
    activeSlug?: string
    onselect?: (slug: string) => void
    onopen?: (slug: string) => void
  } = $props()

  interface Particle {
    data: GraphNode2D
    x: number
    y: number
    vx: number
    vy: number
    r: number
  }
  interface Link {
    data: GraphEdge2D
    src: Particle
    dst: Particle
  }

  let host: HTMLDivElement
  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  let raf = 0
  let observer: ResizeObserver | undefined

  let particles: Particle[] = []
  let bySlug = new Map<string, Particle>()
  let links: Link[] = []
  let hovered: Particle | null = null

  // Camera (world→screen): screen = center + offset + world * scale.
  let scale = 1
  let offsetX = 0
  let offsetY = 0
  let fitted = false

  const palette = ['#008f73', '#276ef1', '#c56a00', '#d33f49', '#8357c5', '#007c9b', '#b7791f']

  function themeColors() {
    const s = getComputedStyle(host ?? document.documentElement)
    const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
    return {
      bg: v('--bg', '#0f1115'),
      text: v('--text', '#d8dee9'),
      related: v('--accent', '#008f73'),
      active: '#d87500',
    }
  }
  let colors = themeColors()

  function hash(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    return h >>> 0
  }
  const collectionColor = (slug: string) =>
    palette[hash(slug.split('/')[0] ?? slug) % palette.length] ?? '#008f73'

  // Deterministic 2D phyllotaxis seed so the layout is stable across reloads before the sim settles.
  function seed(i: number, slug: string): { x: number; y: number } {
    const golden = Math.PI * (3 - Math.sqrt(5))
    const theta = golden * i + (hash(slug) % 360) * (Math.PI / 180)
    const radius = 26 * Math.sqrt(i + 1)
    return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius }
  }

  function rebuild() {
    const prev = bySlug
    bySlug = new Map()
    const sorted = [...nodes].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
    particles = sorted.map((data, i) => {
      const old = prev.get(data.slug)
      const base = old ?? { ...seed(i, data.slug), vx: 0, vy: 0 }
      const p: Particle = {
        data,
        x: base.x,
        y: base.y,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
        r: 3 + Math.min(9, data.degree * 1.1),
      }
      bySlug.set(data.slug, p)
      return p
    })
    links = edges
      .map((data) => {
        const src = bySlug.get(data.src)
        const dst = bySlug.get(data.dst)
        return src && dst ? { data, src, dst } : null
      })
      .filter((l): l is Link => l !== null)
    if (!fitted && particles.length) fit()
  }

  function fit() {
    let max = 1
    for (const p of particles) max = Math.max(max, Math.abs(p.x), Math.abs(p.y))
    const rect = host.getBoundingClientRect()
    scale = Math.min(2.2, Math.max(0.25, Math.min(rect.width, rect.height) / (max * 2.4 || 1)))
    offsetX = 0
    offsetY = 0
    fitted = true
  }

  function step() {
    const repulsion = 1600
    const spring = 0.012
    const target = 64
    const center = 0.003
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i]
      if (!a) continue
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j]
        if (!b) continue
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          dx = (hash(a.data.slug + b.data.slug) % 20) - 10 || 1
          dy = (hash(b.data.slug + a.data.slug) % 20) - 10 || 1
          d2 = dx * dx + dy * dy
        }
        const f = repulsion / d2
        const inv = 1 / Math.sqrt(d2)
        a.vx += dx * inv * f
        a.vy += dy * inv * f
        b.vx -= dx * inv * f
        b.vy -= dy * inv * f
      }
    }
    for (const l of links) {
      const dx = l.dst.x - l.src.x
      const dy = l.dst.y - l.src.y
      const dist = Math.max(0.01, Math.hypot(dx, dy))
      const f = (dist - target) * spring
      const ux = (dx / dist) * f
      const uy = (dy / dist) * f
      l.src.vx += ux
      l.src.vy += uy
      l.dst.vx -= ux
      l.dst.vy -= uy
    }
    for (const p of particles) {
      p.vx += -p.x * center
      p.vy += -p.y * center
      p.vx *= 0.9
      p.vy *= 0.9
      p.x += p.vx
      p.y += p.vy
    }
  }

  const sx = (x: number, cx: number) => cx + offsetX + x * scale
  const sy = (y: number, cy: number) => cy + offsetY + y * scale

  function draw() {
    if (!ctx) return
    const rect = host.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const h = Math.max(1, rect.height)
    const cx = w / 2
    const cy = h / 2
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, w, h)

    // edges
    ctx.lineWidth = 1
    for (const l of links) {
      const on = l.data.active || !activeSlug
      ctx.strokeStyle = on ? '#16836f' : '#5878c9'
      ctx.globalAlpha = on ? 0.7 : 0.16
      ctx.beginPath()
      ctx.moveTo(sx(l.src.x, cx), sy(l.src.y, cy))
      ctx.lineTo(sx(l.dst.x, cx), sy(l.dst.y, cy))
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // nodes
    for (const p of particles) {
      const isActive = p.data.slug === activeSlug
      const isHover = p === hovered
      const fill = isActive
        ? colors.active
        : isHover
          ? colors.text
          : p.data.related
            ? colors.related
            : collectionColor(p.data.slug)
      ctx.globalAlpha = p.data.dim ? 0.3 : 1
      ctx.beginPath()
      ctx.arc(sx(p.x, cx), sy(p.y, cy), Math.max(2, p.r * scale), 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      if (isActive || isHover) {
        ctx.lineWidth = 2
        ctx.strokeStyle = colors.text
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // labels (screen space, constant size) — only where they add signal
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineWidth = 3
    for (const p of particles) {
      const show = p.data.slug === activeSlug || p === hovered || p.data.related || p.data.degree >= 2
      if (!show) continue
      const label = p.data.title.length > 26 ? `${p.data.title.slice(0, 23)}...` : p.data.title
      const lx = sx(p.x, cx)
      const ly = sy(p.y, cy) - Math.max(2, p.r * scale) - 2
      ctx.globalAlpha = p.data.dim ? 0.45 : 1
      ctx.strokeStyle = colors.bg
      ctx.strokeText(label, lx, ly)
      ctx.fillStyle = colors.text
      ctx.fillText(label, lx, ly)
    }
    ctx.globalAlpha = 1
  }

  function frame() {
    step()
    draw()
    raf = requestAnimationFrame(frame)
  }

  function resize() {
    const rect = host.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }

  function worldAt(clientX: number, clientY: number): { x: number; y: number } {
    const rect = host.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    return {
      x: (clientX - rect.left - cx - offsetX) / scale,
      y: (clientY - rect.top - cy - offsetY) / scale,
    }
  }

  function hit(clientX: number, clientY: number): Particle | null {
    const p = worldAt(clientX, clientY)
    let best: Particle | null = null
    let bestD = Infinity
    for (const part of particles) {
      const dx = part.x - p.x
      const dy = part.y - p.y
      const d = Math.hypot(dx, dy)
      const rad = Math.max(6 / scale, part.r + 4 / scale)
      if (d < rad && d < bestD) {
        bestD = d
        best = part
      }
    }
    return best
  }

  // pan/click bookkeeping
  let panning = false
  let moved = false
  let lastX = 0
  let lastY = 0

  function onPointerDown(e: PointerEvent) {
    moved = false
    lastX = e.clientX
    lastY = e.clientY
    if (!hit(e.clientX, e.clientY)) {
      panning = true
      host.setPointerCapture(e.pointerId)
      host.style.cursor = 'grabbing'
    }
  }
  function onPointerMove(e: PointerEvent) {
    if (panning) {
      offsetX += e.clientX - lastX
      offsetY += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      moved = true
      return
    }
    const next = hit(e.clientX, e.clientY)
    if (next !== hovered) {
      hovered = next
      host.style.cursor = hovered ? 'pointer' : 'grab'
    }
  }
  function onPointerUp(e: PointerEvent) {
    if (panning) {
      panning = false
      host.releasePointerCapture(e.pointerId)
      host.style.cursor = hovered ? 'pointer' : 'grab'
      return
    }
    if (moved) return
    const h = hit(e.clientX, e.clientY)
    if (h) onselect?.(h.data.slug)
  }
  function onDblClick(e: MouseEvent) {
    const h = hit(e.clientX, e.clientY)
    if (h) onopen?.(h.data.slug)
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const rect = host.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const before = worldAt(e.clientX, e.clientY)
    const factor = Math.exp(-e.deltaY * 0.001)
    scale = Math.min(4, Math.max(0.15, scale * factor))
    // keep the point under the cursor stationary
    offsetX = e.clientX - rect.left - cx - before.x * scale
    offsetY = e.clientY - rect.top - cy - before.y * scale
  }

  onMount(() => {
    ctx = canvas.getContext('2d')
    colors = themeColors()
    resize()
    observer = new ResizeObserver(resize)
    observer.observe(host)
    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerup', onPointerUp)
    host.addEventListener('dblclick', onDblClick)
    host.addEventListener('wheel', onWheel, { passive: false })
    frame()
    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerup', onPointerUp)
      host.removeEventListener('dblclick', onDblClick)
      host.removeEventListener('wheel', onWheel)
    }
  })

  // Rebuild particles/links when the graph data changes (positions preserved for persisting nodes).
  $effect(() => {
    void nodes
    void edges
    rebuild()
  })

  // Re-read theme tokens on a flip.
  $effect(() => {
    theme.current
    colors = themeColors()
  })
</script>

<div class="graph2d" bind:this={host} role="presentation">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .graph2d {
    position: relative;
    width: 100%;
    height: clamp(360px, 58vh, 680px);
    min-height: 360px;
    overflow: hidden;
    cursor: grab;
    background: var(--bg);
    touch-action: none;
  }
  .graph2d :global(canvas) {
    display: block;
  }
</style>
