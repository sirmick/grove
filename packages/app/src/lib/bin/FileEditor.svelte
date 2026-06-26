<script lang="ts">
  // Raw-file editor for the bin view: reads a real OS file, edits it with syntax highlighting
  // (language picked from extension, falling back to the shebang for extensionless executables),
  // and writes it back. Ctrl/Cmd+S or the Save button persists; the bin listing refreshes after so
  // a changed executable bit / new file shows. Binary and oversized files are shown read-only.
  import { markdown } from '@codemirror/lang-markdown'
  import { yaml } from '@codemirror/lang-yaml'
  import { StreamLanguage } from '@codemirror/language'
  import { c, cpp } from '@codemirror/legacy-modes/mode/clike'
  import { go } from '@codemirror/legacy-modes/mode/go'
  import { javascript } from '@codemirror/legacy-modes/mode/javascript'
  import { python } from '@codemirror/legacy-modes/mode/python'
  import { ruby } from '@codemirror/legacy-modes/mode/ruby'
  import { shell } from '@codemirror/legacy-modes/mode/shell'
  import { EditorState, type Extension } from '@codemirror/state'
  import { EditorView, basicSetup } from 'codemirror'
  import { onMount } from 'svelte'
  import Icon from '../icons/Icon.svelte'
  import { loadBin, readFile, writeFile } from './bin.svelte'

  let { path }: { path: string } = $props()

  let host: HTMLDivElement
  let view: EditorView | undefined
  let content = ''
  let status = $state<'loading' | 'ready' | 'binary' | 'missing'>('loading')
  let exec = $state(false)
  let dirty = $state(false)
  let saving = $state(false)
  let saved = $state('')

  function langFor(name: string, body: string): Extension {
    const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
    switch (ext) {
      case 'md':
      case 'markdown':
        return markdown()
      case 'yml':
      case 'yaml':
        return yaml()
      case 'sh':
      case 'bash':
      case 'zsh':
      case 'fish':
        return StreamLanguage.define(shell)
      case 'py':
        return StreamLanguage.define(python)
      case 'js':
      case 'mjs':
      case 'cjs':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'json':
        return StreamLanguage.define(javascript)
      case 'rb':
        return StreamLanguage.define(ruby)
      case 'go':
        return StreamLanguage.define(go)
      case 'c':
      case 'h':
        return StreamLanguage.define(c)
      case 'cc':
      case 'cpp':
      case 'hpp':
        return StreamLanguage.define(cpp)
      default: {
        const first = body.slice(0, 64)
        if (/^#!.*\b(bash|sh|zsh)\b/.test(first)) return StreamLanguage.define(shell)
        if (/^#!.*\bpython/.test(first)) return StreamLanguage.define(python)
        if (/^#!.*\bnode\b/.test(first)) return StreamLanguage.define(javascript)
        return []
      }
    }
  }

  const theme = EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', color: 'var(--text)', fontSize: '13px', height: '100%' },
      '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
      '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none' },
      '&.cm-focused': { outline: 'none' },
    },
    { dark: true },
  )

  async function save() {
    if (!dirty || saving) return
    saving = true
    const ok = await writeFile(path, content)
    saving = false
    if (ok) {
      dirty = false
      saved = 'saved'
      setTimeout(() => (saved = ''), 2000)
      void loadBin() // pick up exec-bit / size changes
    } else {
      saved = 'save failed'
    }
  }

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void save()
    }
  }

  onMount(() => {
    void (async () => {
      const f = await readFile(path)
      if (!f) {
        status = 'missing'
        return
      }
      exec = f.exec
      if (f.binary || f.tooLarge) {
        status = 'binary'
        return
      }
      content = f.content
      status = 'ready'
      view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            langFor(path.split('/').pop() ?? path, content),
            theme,
            EditorView.lineWrapping,
            EditorView.updateListener.of((u) => {
              if (u.docChanged) {
                content = u.state.doc.toString()
                dirty = true
              }
            }),
          ],
        }),
      })
    })()
    return () => view?.destroy()
  })
</script>

<div class="file" onkeydowncapture={onKey}>
  <header class="bar">
    <span class="path">{path}</span>
    {#if exec}<span class="badge exec" title="executable">exec</span>{/if}
    <span class="grow"></span>
    {#if saved}<span class="muted">{saved}</span>{/if}
    {#if status === 'ready'}
      <button class="btn primary" disabled={!dirty || saving} onclick={save}>
        <Icon name="save" size={14} /> Save{dirty ? ' •' : ''}
      </button>
    {/if}
  </header>

  {#if status === 'loading'}
    <p class="muted note">Loading…</p>
  {:else if status === 'missing'}
    <p class="muted note">File not found.</p>
  {:else if status === 'binary'}
    <p class="muted note">Binary or oversized file — not shown.</p>
  {/if}
  <div class="cm" class:hidden={status !== 'ready'} bind:this={host}></div>
</div>

<style>
  .file {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    height: 100%;
    min-height: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    flex: none;
  }
  .path {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: var(--muted);
  }
  .badge.exec {
    font-size: 10px;
    font-style: normal;
    color: #1f7a33;
    border: 1px solid #1f7a33;
    border-radius: 3px;
    padding: 0 4px;
  }
  .grow {
    flex: 1;
  }
  .note {
    padding: 16px;
  }
  .cm {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--panel-2);
  }
  .cm.hidden {
    display: none;
  }
  .cm :global(.cm-editor) {
    height: 100%;
  }
  .cm :global(.cm-scroller) {
    overflow: auto;
  }
</style>
