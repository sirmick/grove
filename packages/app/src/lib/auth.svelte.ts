// Tracks whether the server is rejecting us for lack of a token. Reached off-box, grove gates every
// endpoint: the read/write/SSE calls 401 and degrade silently to the bundled corpus + OPFS drafts,
// while the terminal's WebSocket can't surface its own handshake 401 (browsers hide it) and just
// reconnect-loops blank. So the HTTP calls flag the condition here and the app shows one banner that
// explains both — reopen with the token URL the server prints.
export const authState = $state<{ unauthorized: boolean }>({ unauthorized: false })

// Feed any same-origin server Response: a 401 raises the banner; any success clears it.
export function noteAuth(res: Response): void {
  if (res.status === 401) authState.unauthorized = true
  else if (res.ok) authState.unauthorized = false
}
