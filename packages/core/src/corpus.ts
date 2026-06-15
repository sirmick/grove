// A Corpus is the raw source of a space: path (relative to the space root) → file text.
// The same shape is produced by the Node loader (tests, watcher) and the generated FE bundle.
export type Corpus = Record<string, string>

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function baseName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

export function isUnderGrove(path: string): boolean {
  return path.split('/').includes('_grove')
}
