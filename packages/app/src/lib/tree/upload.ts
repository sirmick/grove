// OS drag-drop upload: write the files dropped onto a collection into that collection's dir on the
// server (PUT /upload/<collection>/<name>). Markdown/yaml land as records (the corpus picks them
// up on the respin); other allowed types are stored as assets. Filenames are sanitized to a bare
// basename so a drag can't traverse out of the target collection.

const ALLOWED = /\.(md|markdown|ya?ml|txt|csv|tsv|json|png|jpe?g|gif|svg|webp|pdf)$/i

export interface UploadResult {
  uploaded: string[]
  rejected: string[] // unsupported type or failed write
}

function sanitize(name: string): string {
  return name.replace(/^.*[/\\]/, '').replace(/[^A-Za-z0-9._ -]/g, '_')
}

export async function uploadFiles(dest: string, files: readonly File[]): Promise<UploadResult> {
  const destRel = dest.replace(/^\/+|\/+$/g, '')
  const uploaded: string[] = []
  const rejected: string[] = []
  for (const file of files) {
    const name = sanitize(file.name)
    if (!name || !ALLOWED.test(name)) {
      rejected.push(file.name)
      continue
    }
    const rel = destRel ? `${destRel}/${name}` : name
    try {
      const res = await fetch(`/upload/${rel.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: await file.arrayBuffer(),
      })
      if (res.ok) uploaded.push(name)
      else rejected.push(file.name)
    } catch {
      rejected.push(file.name)
    }
  }
  return { uploaded, rejected }
}
