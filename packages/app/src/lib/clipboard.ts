// System clipboard with a synchronous fallback. navigator.clipboard is async and gated on focus +
// permissions; when it's unavailable (insecure origin, denied) we fall back to a hidden textarea +
// execCommand('copy') so copy-on-select still works. Mirrors wash's clipboard.ts behavior.

export function copyText(text: string): void {
  if (!text) return
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    return
  }
  fallbackCopy(text)
}

function fallbackCopy(text: string): void {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;top:-200px;left:0;opacity:0'
  document.body.appendChild(ta)
  const prev = document.activeElement as HTMLElement | null
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    /* best effort */
  }
  ta.remove()
  prev?.focus?.()
}

export async function pasteText(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText()
  } catch {
    /* denied / unavailable */
  }
  return ''
}
