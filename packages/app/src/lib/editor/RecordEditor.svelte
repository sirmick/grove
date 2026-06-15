<script lang="ts">
  import { type RecordDetail, type SchemaHint, composeFile, dirOf } from '@grove/core'
  import { untrack } from 'svelte'
  import { setDraft } from '../db/drafts.svelte'
  import { currentHead } from '../db/sync.svelte'
  import { grove } from '../grove/client'
  import { editor } from '../ui.svelte'
  import CodeEditor from './CodeEditor.svelte'
  import FormBody from './FormBody.svelte'
  import Wysiwyg from './Wysiwyg.svelte'

  let { slug }: { slug: string } = $props()

  const rec = untrack(() => grove.records.read(slug)) as RecordDetail
  const schema: SchemaHint = untrack(() => grove.schema.get(dirOf(slug)))
  const links = untrack(() => grove.search.slugs())

  // Single source of truth: the markdown body (after frontmatter). The view (Document/Form/Source,
  // chosen in the top bar) is keyed by editor.mode; switching remounts from the current body.
  let body = $state(rec.body)
  function setBody(b: string) {
    body = b
    setDraft(`${slug}.md`, composeFile(rec.frontmatter, b), currentHead())
  }
</script>

<div class="editor" class:full={editor.mode !== 'form'}>
  {#if editor.mode === 'document'}
    <Wysiwyg content={body} {links} onchange={setBody} />
  {:else if editor.mode === 'form'}
    <FormBody {body} {schema} {slug} {links} onchange={setBody} />
  {:else}
    <CodeEditor value={body} language="markdown" onchange={setBody} />
  {/if}
</div>

<style>
  .editor {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* Document & Source fill the pane edge-to-edge; Form scrolls with padding. */
  .editor.full > :global(div) {
    flex: 1;
    min-height: 0;
  }
  .editor:not(.full) {
    overflow: auto;
    padding: 18px 22px;
  }
</style>
