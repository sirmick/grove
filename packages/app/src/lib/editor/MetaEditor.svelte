<script lang="ts">
  import { untrack } from 'svelte'
  import { setDraft } from '../db/drafts.svelte'
  import { currentHead } from '../db/sync.svelte'
  import { grove } from '../grove/client'
  import CodeEditor from './CodeEditor.svelte'

  let { path, language }: { path: string; language: 'yaml' | 'markdown' } = $props()

  const initial = untrack(() => grove.meta.get(path) ?? '')

  function onChange(v: string) {
    setDraft(path, v, currentHead())
  }
</script>

<div class="meta">
  <div class="muted path">{path}</div>
  <CodeEditor value={initial} {language} onchange={onChange} />
  <div class="muted hint">edits auto-save as a draft — Commit in the top bar</div>
</div>

<style>
  .meta {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .path,
  .hint {
    font-size: 12px;
  }
</style>
