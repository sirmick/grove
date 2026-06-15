// The write/sync seam. M2 uses the dev write-middleware (PUT /incoming); M4 swaps this for
// isomorphic-git push without touching callers.
export interface Transport {
  put(path: string, content: string): Promise<void>
}

export const httpTransport: Transport = {
  async put(path, content) {
    const res = await fetch(`/incoming/${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: content,
    })
    if (!res.ok) throw new Error(`PUT /incoming/${path} → ${res.status}`)
  },
}
