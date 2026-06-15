<script lang="ts">
  // Rich markdown editor — TipTap (ProseMirror) with markdown round-trip via tiptap-markdown.
  // Pattern borrowed from wash-edit's wysiwyg.ts: the on-open markdown is loaded with
  // setContent (NOT the constructor `content`) because tiptap-markdown's parser hooks onto
  // setContent in TipTap v3. Wikilinks `[[slug]]` aren't markdown syntax, so they survive
  // round-trip as literal text. The formatting bar + the wikilink picker live here (Source
  // view stays bare markdown).
  import { Editor } from '@tiptap/core'
  import StarterKit from '@tiptap/starter-kit'
  import { onMount } from 'svelte'
  import { Markdown } from 'tiptap-markdown'

  let {
    content = '',
    links = [],
    onchange,
  }: { content?: string; links?: string[]; onchange?: (md: string) => void } = $props()

  let host: HTMLDivElement
  let editor = $state<Editor>()
  let tick = $state(0) // bumped on every transaction so toolbar active-state stays reactive
  let pick = $state('')

  const getMd = (e: Editor): string =>
    (e.storage as { markdown?: { getMarkdown(): string } }).markdown?.getMarkdown() ?? ''

  const isOn = (name: string, attrs?: Record<string, unknown>) => {
    void tick
    return editor?.isActive(name, attrs) ?? false
  }

  onMount(() => {
    const ed = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({
          codeBlock: { HTMLAttributes: { class: 'wys-code' } },
          link: { openOnClick: false, autolink: true, linkOnPaste: true },
        }),
        Markdown.configure({
          html: true,
          tightLists: true,
          bulletListMarker: '-',
          linkify: true,
          breaks: false,
          transformPastedText: true,
          transformCopiedText: false,
        }),
      ],
      editorProps: { attributes: { class: 'wys', spellcheck: 'true' } },
      onUpdate: ({ editor }) => onchange?.(getMd(editor)),
      onTransaction: () => {
        tick++
      },
    })
    ed.commands.setContent(content, { emitUpdate: false })
    editor = ed
    return () => ed.destroy()
  })

  const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (editor) fn(editor.chain().focus()).run()
  }

  function insertWikilink() {
    if (pick) editor?.chain().focus().insertContent(`[[${pick}]] `).run()
    pick = ''
  }

  function setLink() {
    if (!editor) return
    const prev = (editor.getAttributes('link').href as string) ?? ''
    const url = window.prompt('Link URL', prev)
    if (url === null) return
    if (url === '') editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href: url }).run()
  }
</script>

<div class="wys-shell">
  <div class="bar">
    <button class="b" class:on={isOn('bold')} title="Bold" onclick={() => run((c) => c.toggleBold())}><b>B</b></button>
    <button class="b" class:on={isOn('italic')} title="Italic" onclick={() => run((c) => c.toggleItalic())}><i>I</i></button>
    <button class="b" class:on={isOn('strike')} title="Strikethrough" onclick={() => run((c) => c.toggleStrike())}><s>S</s></button>
    <button class="b" class:on={isOn('code')} title="Inline code" onclick={() => run((c) => c.toggleCode())}>&lt;&gt;</button>
    <span class="sep"></span>
    <button class="b" class:on={isOn('heading', { level: 1 })} title="Heading 1" onclick={() => run((c) => c.toggleHeading({ level: 1 }))}>H1</button>
    <button class="b" class:on={isOn('heading', { level: 2 })} title="Heading 2" onclick={() => run((c) => c.toggleHeading({ level: 2 }))}>H2</button>
    <button class="b" class:on={isOn('heading', { level: 3 })} title="Heading 3" onclick={() => run((c) => c.toggleHeading({ level: 3 }))}>H3</button>
    <span class="sep"></span>
    <button class="b" class:on={isOn('bulletList')} title="Bullet list" onclick={() => run((c) => c.toggleBulletList())}>•</button>
    <button class="b" class:on={isOn('orderedList')} title="Ordered list" onclick={() => run((c) => c.toggleOrderedList())}>1.</button>
    <button class="b" class:on={isOn('blockquote')} title="Blockquote" onclick={() => run((c) => c.toggleBlockquote())}>❝</button>
    <button class="b" class:on={isOn('codeBlock')} title="Code block" onclick={() => run((c) => c.toggleCodeBlock())}>{'{ }'}</button>
    <button class="b" title="Horizontal rule" onclick={() => run((c) => c.setHorizontalRule())}>―</button>
    <span class="sep"></span>
    <button class="b" class:on={isOn('link')} title="Web link" onclick={setLink}>🔗</button>
    {#if links.length}
      <select class="linksel" bind:value={pick} onchange={insertWikilink} title="Insert a [[wikilink]]">
        <option value="">[[link]]…</option>
        {#each links as s (s)}<option value={s}>{s}</option>{/each}
      </select>
    {/if}
  </div>
  <div class="wyswrap" bind:this={host}></div>
</div>

<style>
  .wys-shell {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--panel-2);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
    flex: none;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .bar .b {
    min-width: 26px;
    height: 24px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    padding: 0 6px;
  }
  .bar .b:hover {
    background: var(--panel-2);
  }
  .bar .b.on {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .bar .sep {
    width: 1px;
    height: 16px;
    background: var(--border);
    margin: 0 4px;
  }
  .linksel {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    padding: 2px 4px;
    max-width: 160px;
  }
  .wyswrap {
    flex: 1;
    min-height: 140px;
    overflow: auto;
  }
  .wyswrap :global(.wys) {
    outline: none;
    padding: 12px 14px;
    color: var(--text);
    line-height: 1.55;
  }
  .wyswrap :global(.wys:focus) {
    outline: none;
  }
  .wyswrap :global(.wys > *:first-child) {
    margin-top: 0;
  }
  .wyswrap :global(.wys h1),
  .wyswrap :global(.wys h2),
  .wyswrap :global(.wys h3) {
    line-height: 1.25;
  }
  .wyswrap :global(.wys a) {
    color: var(--accent);
  }
  .wyswrap :global(.wys code) {
    background: var(--panel);
    padding: 1px 4px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.92em;
  }
  .wyswrap :global(.wys pre) {
    background: var(--panel);
    padding: 10px 12px;
    border-radius: 6px;
    overflow: auto;
  }
  .wyswrap :global(.wys pre code) {
    background: none;
    padding: 0;
  }
  .wyswrap :global(.wys blockquote) {
    border-left: 3px solid var(--border);
    margin: 0;
    padding-left: 12px;
    color: var(--muted);
  }
</style>
