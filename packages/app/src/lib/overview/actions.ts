// Parses the AI-maintained "frequent actions" menu (`_grove/actions.md`) into structured items the
// Project page can render. The file is a list of `## Title` sections, each with an optional
// `**Asked:** N×` count line followed by the request text the AI would act on next time.

export type FrequentAction = { title: string; count: number | null; request: string }

const ASKED = /^\s*\*\*Asked:\*\*\s*(\d+)/i

/** Split `_grove/actions.md` into actions, sorted most-asked first (untracked counts last). */
export function parseActions(md: string | undefined): FrequentAction[] {
  if (!md?.trim()) return []
  // Drop the preamble before the first `## ` heading, then one action per heading.
  const sections = md.split(/^##[ \t]+/m).slice(1)
  const actions: FrequentAction[] = []
  for (const sec of sections) {
    const nl = sec.indexOf('\n')
    const title = (nl === -1 ? sec : sec.slice(0, nl)).trim()
    if (!title) continue
    let count: number | null = null
    const request = (nl === -1 ? '' : sec.slice(nl + 1))
      .split('\n')
      .filter((line) => {
        const m = line.match(ASKED)
        if (m) {
          count = Number(m[1])
          return false
        }
        return true
      })
      .join('\n')
      .trim()
    actions.push({ title, count, request })
  }
  return actions.sort((a, b) => (b.count ?? -1) - (a.count ?? -1))
}
