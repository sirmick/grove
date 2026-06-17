// Client-side rendering of the ```dot / ```mermaid placeholders md.ts emits, into inline SVG.
// Both libs are dynamically imported so they (and graphviz's ~1MB WASM) only load the first time a
// rendered page actually contains a diagram. Results are written into the placeholder in place.

// The /graphviz subpath's published types don't surface the `Graphviz` namespace (it's in the
// package root), though the runtime export is there — describe the bit we use.
type GraphvizModule = { Graphviz: { load(): Promise<{ dot(src: string): string }> } }
let graphvizP: Promise<{ dot(src: string): string }> | null = null
function loadGraphviz() {
  graphvizP ??= import('@hpcc-js/wasm/graphviz').then((m) =>
    (m as unknown as GraphvizModule).Graphviz.load(),
  )
  return graphvizP
}

let mermaidP: Promise<typeof import('mermaid').default> | null = null
function loadMermaid() {
  mermaidP ??= import('mermaid').then((m) => {
    // securityLevel: 'strict' — content can be AI-generated, so no embedded HTML / click handlers.
    m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
    return m.default
  })
  return mermaidP
}

let seq = 0

async function toSvg(lang: string, src: string): Promise<string> {
  if (lang === 'mermaid') {
    const mermaid = await loadMermaid()
    const { svg } = await mermaid.render(`mmd-${++seq}`, src)
    return svg
  }
  const graphviz = await loadGraphviz()
  return graphviz.dot(src)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

/** Render every unrendered diagram placeholder inside `root`. `alive` lets a caller cancel a stale
 *  pass (content changed mid-flight) so its async result isn't written into replaced DOM. */
export async function renderDiagrams(
  root: HTMLElement,
  alive: () => boolean = () => true,
): Promise<void> {
  const els = root.querySelectorAll<HTMLElement>('.diagram[data-src]:not([data-rendered])')
  for (const el of els) {
    el.dataset.rendered = '1'
    const lang = el.dataset.lang ?? 'dot'
    const src = decodeURIComponent(el.dataset.src ?? '')
    try {
      const svg = await toSvg(lang, src)
      if (!alive()) return
      el.innerHTML = svg
    } catch (e) {
      if (!alive()) return
      el.innerHTML = `<pre class="diagram-error">${escapeHtml((e as Error)?.message ?? String(e))}</pre>`
    }
  }
}

/** Svelte action: render diagram placeholders inside `node` after {@html} mounts and on each update.
 *  Apply it to the element that holds rendered markdown, passing the source so updates re-scan:
 *  `<div use:diagrams={source}>{@html renderMarkdown(source)}</div>`. */
export function diagrams(node: HTMLElement, _source?: unknown) {
  let token = 0
  const run = () => {
    const mine = ++token
    // Defer to a microtask so Svelte has flushed the {@html} content before we scan.
    queueMicrotask(() => void renderDiagrams(node, () => mine === token))
  }
  run()
  return {
    // `_next` is the new source — its change is what re-triggers this action; we just re-scan.
    update(_next?: unknown) {
      run()
    },
    destroy() {
      token++ // invalidate any in-flight pass
    },
  }
}
