import { marked } from 'marked'

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
