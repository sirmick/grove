import { marked } from 'marked'

// ```dot / ```graphviz / ```mermaid fences become empty placeholders; diagrams.ts renders them to
// inline SVG client-side after the HTML mounts (the libs are heavy + async, so they lazy-load and
// only when a page actually contains a diagram). The source is URI-encoded into a data attribute
// so the placeholder shows nothing until rendered (no flash of raw diagram source).
const DIAGRAM_LANGS: Record<string, 'dot' | 'mermaid'> = {
  dot: 'dot',
  graphviz: 'dot',
  mermaid: 'mermaid',
}

marked.use({
  renderer: {
    code({ text, lang }) {
      const kind = DIAGRAM_LANGS[(lang ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '']
      if (!kind) return false // not a diagram → marked's default code rendering
      return `<div class="diagram" data-lang="${kind}" data-src="${encodeURIComponent(text)}"></div>`
    },
  },
})

// Render wikilinks as plain display text (navigation is via the Links/Backlinks panels in M1).
function deWiki(src: string): string {
  return src.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, slug: string, display?: string) => display ?? slug.split('/').pop() ?? slug,
  )
}

export function renderMarkdown(src: string): string {
  return marked.parse(deWiki(src), { async: false }) as string
}
