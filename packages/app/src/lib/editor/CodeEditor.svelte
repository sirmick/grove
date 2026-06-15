<script lang="ts">
  import { markdown } from '@codemirror/lang-markdown'
  import { yaml } from '@codemirror/lang-yaml'
  import { EditorState } from '@codemirror/state'
  import { EditorView, basicSetup } from 'codemirror'
  import { onMount } from 'svelte'

  let {
    value = $bindable(''),
    language = 'markdown',
    readonly = false,
    onchange,
  }: {
    value?: string
    language?: 'markdown' | 'yaml'
    readonly?: boolean
    onchange?: (v: string) => void
  } = $props()

  let host: HTMLDivElement
  let view: EditorView | undefined

  const theme = EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', color: 'var(--text)', fontSize: '13px' },
      '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
      '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none' },
      '&.cm-focused': { outline: 'none' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    },
    { dark: true },
  )

  export function insertAtCursor(text: string) {
    if (!view) return
    const s = view.state.selection.main
    view.dispatch({
      changes: { from: s.from, to: s.to, insert: text },
      selection: { anchor: s.from + text.length },
    })
    view.focus()
  }

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          language === 'yaml' ? yaml() : markdown(),
          theme,
          EditorView.editable.of(!readonly),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              value = u.state.doc.toString()
              onchange?.(value)
            }
          }),
        ],
      }),
    })
    return () => view?.destroy()
  })
</script>

<div class="cm" bind:this={host}></div>

<style>
  .cm {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--panel-2);
  }
  .cm :global(.cm-editor) {
    max-height: 55vh;
  }
  .cm :global(.cm-scroller) {
    overflow: auto;
  }
</style>
