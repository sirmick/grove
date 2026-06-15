<script lang="ts">
  import { type RecordDetail, type SchemaHint, composeFile, dirOf } from '@grove/core'
  import { untrack } from 'svelte'
  import { setDraft } from '../db/drafts.svelte'
  import { currentHead } from '../db/sync.svelte'
  import { grove } from '../grove/client'
  import CodeEditor from './CodeEditor.svelte'
  import FormBody from './FormBody.svelte'
  import Wysiwyg from './Wysiwyg.svelte'

  let { slug, ondone }: { slug: string; ondone?: () => void } = $props()

  const rec = untrack(() => grove.records.read(slug)) as RecordDetail
  const schema: SchemaHint = untrack(() => grove.schema.get(dirOf(slug)))
  const links = untrack(() => grove.search.slugs())

  // Single source of truth: the markdown body (everything after frontmatter). All three views
  // read/write it; the {#if} remounts the active view from the current body when you switch, so
  // they stay in sync. The `entry` hint sets the default view; any view is reachable via the bar.
  let body = $state(rec.body)
  type Mode = 'document' | 'form' | 'source'
  let mode = $state<Mode>(schema.entry === 'form' ? 'form' : 'document')

  function setBody(b: string) {
    body = b
    setDraft(`${slug}.md`, composeFile(rec.frontmatter, b), currentHead())
  }
</script>

<div class="editor">
  <div class="modebar">
    <div class="modetoggle">
      <button class:active={mode === 'document'} onclick={() => (mode = 'document')} title="Whole document, rich text">Document</button>
      <button class:active={mode === 'form'} onclick={() => (mode = 'form')} title="Structured fields + body">Form</button>
      <button class:active={mode === 'source'} onclick={() => (mode = 'source')} title="Raw markdown">Source</button>
    </div>
    {#if ondone}<button class="done" onclick={ondone}>Done</button>{/if}
  </div>

  {#if mode === 'document'}
    <Wysiwyg content={body} {links} onchange={setBody} />
  {:else if mode === 'form'}
    <FormBody {body} {schema} {slug} {links} onchange={setBody} />
  {:else}
    <CodeEditor value={body} language="markdown" onchange={setBody} />
  {/if}

  <span class="muted hint">edits auto-save as a draft — Commit in the top bar</span>
</div>

<style>
  .editor {
    max-width: 860px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .modebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modetoggle {
    display: flex;
    gap: 2px;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .modetoggle button {
    background: var(--panel-2);
    border: 0;
    color: var(--muted);
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .modetoggle button.active {
    background: var(--accent);
    color: #03110d;
    font-weight: 600;
  }
  .done {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 4px 12px;
    cursor: pointer;
  }
  .hint {
    font-size: 12px;
  }
</style>
