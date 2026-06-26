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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;')

// All links resolve relative to the PROJECT, not the SPA URL. A doc at slug "capitals/tokyo" sits in
// "capitals/", so a doc-relative `pic.png` → "capitals/pic.png", `../notes/x.md` → "notes/x.md". A
// leading "/" is project-root-absolute. The result is a clean project-relative path (no "..").
function resolveRel(baseSlug: string, target: string): string {
  const clean = target.replace(/[?#].*$/, '')
  const baseDir = baseSlug.includes('/') ? baseSlug.slice(0, baseSlug.lastIndexOf('/')) : ''
  const segs = clean.startsWith('/')
    ? clean.slice(1).split('/')
    : (baseDir ? baseDir.split('/') : []).concat(clean.split('/'))
  const out: string[] = []
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

const assetUrl = (rel: string) => `/assets/${rel.split('/').map(encodeURIComponent).join('/')}`
const isExternal = (href: string) => /^(https?:|mailto:|tel:|data:|#)/i.test(href)

// The doc being rendered, set per call so the global renderer can resolve doc-relative paths.
// Safe because marked.parse runs synchronously (async:false), single-threaded.
let currentBase = ''

marked.use({
  renderer: {
    code({ text, lang }) {
      const kind = DIAGRAM_LANGS[(lang ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '']
      if (!kind) return false // not a diagram → marked's default code rendering
      return `<div class="diagram" data-lang="${kind}" data-src="${encodeURIComponent(text)}"></div>`
    },
    // Relative links: a `.md` target becomes in-app navigation (DocView intercepts .rellink clicks);
    // any other relative target points at a served asset. External/anchor links keep marked's default.
    link({ href, text }) {
      if (!href || isExternal(href)) return false
      const resolved = resolveRel(currentBase, href)
      if (/\.(md|markdown)$/i.test(href)) {
        const slug = resolved.replace(/\.(md|markdown)$/i, '')
        return `<a class="rellink" data-slug="${escapeAttr(slug)}" href="#${escapeAttr(slug)}">${escapeHtml(text)}</a>`
      }
      return `<a href="${assetUrl(resolved)}">${escapeHtml(text)}</a>`
    },
    // Relative images load from the asset route; external/data images keep marked's default.
    image({ href, text, title }) {
      if (!href || /^(https?:|data:)/i.test(href)) return false
      const t = title ? ` title="${escapeAttr(title)}"` : ''
      return `<img src="${assetUrl(resolveRel(currentBase, href))}" alt="${escapeAttr(text ?? '')}"${t} loading="lazy">`
    },
  },
})

// Turn `[[slug]]` / `[[slug|display]]` into inline clickable links (project-relative slug in
// data-slug; DocView intercepts .wikilink clicks to navigate). marked passes the inline HTML through.
function rewriteWikilinks(src: string): string {
  return src.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, slug: string, display?: string) => {
    const s = slug.trim()
    const label = display ?? s.split('/').pop() ?? s
    return `<a class="wikilink" data-slug="${escapeAttr(s)}" href="#${escapeAttr(s)}">${escapeHtml(label)}</a>`
  })
}

/** Render markdown to HTML. baseSlug is the doc's slug, used to resolve doc-relative links/images. */
export function renderMarkdown(src: string, baseSlug = ''): string {
  currentBase = baseSlug
  return marked.parse(rewriteWikilinks(src), { async: false }) as string
}
