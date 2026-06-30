// App theme (light / dark). The whole palette lives as CSS custom properties in app.css, split into
// a `[data-theme='dark']` set (also the `:root` default) and a `[data-theme='light']` set. Flipping
// the `data-theme` attribute on <html> reskins everything that uses the tokens — no per-component
// logic. The choice is persisted per-browser; first run follows the OS preference (default dark).

export type Theme = 'light' | 'dark'

const KEY = 'grove.theme'

function initialTheme(): Theme {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
  if (saved === 'light' || saved === 'dark') return saved
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches)
    return 'light'
  return 'dark'
}

export const theme = $state<{ current: Theme }>({ current: initialTheme() })

/** Reflect the current theme onto <html data-theme> so the matching CSS token set takes effect. */
export function applyTheme(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme.current
}

export function setTheme(t: Theme): void {
  theme.current = t
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, t)
  applyTheme()
}

export function toggleTheme(): void {
  setTheme(theme.current === 'dark' ? 'light' : 'dark')
}
