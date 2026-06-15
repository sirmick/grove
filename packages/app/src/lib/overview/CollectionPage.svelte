<script lang="ts">
  import type { Row } from '@grove/core'
  import DataTable from '../data/DataTable.svelte'
  import MetaEditor from '../editor/MetaEditor.svelte'
  import { grove } from '../grove/client'
  import { renderMarkdown } from '../md'
  import { openRecord } from '../state.svelte'

  let { path }: { path: string } = $props()

  const detail = $derived(grove.collections.get(path))
  const fields = $derived(Object.entries(detail.schema.fields))
  const rows = $derived(grove.records.list(path) as unknown as Row[])
  const columns = $derived([
    { key: 'title' },
    ...fields.map(([name, hint]) => ({
      key: name,
      numeric: hint.type === 'integer' || hint.type === 'number',
    })),
  ])

  let selectedMeta = $state<{ path: string; language: 'yaml' | 'markdown' } | null>(null)
  $effect(() => {
    void path
    selectedMeta = null
  })

  const metaItems = $derived([
    ...(detail.manifest.schema
      ? [{ label: 'schema.yaml', path: `${path}/_grove/schema.yaml`, language: 'yaml' as const }]
      : []),
    ...detail.manifest.templates.map((t) => ({
      label: `template: ${t}`,
      path: `${path}/_grove/templates/${t}`,
      language: 'markdown' as const,
    })),
    ...detail.manifest.prompts.map((p) => ({
      label: `prompt: ${p}`,
      path: `${path}/_grove/prompts/${p}`,
      language: 'markdown' as const,
    })),
  ])
</script>

<article class="page">
  <div class="overview">{@html renderMarkdown(detail.overview)}</div>

  <section>
    <h3>Schema <span class="muted">· entry: {detail.schema.entry}{detail.schema.extends ? ` · extends: ${detail.schema.extends}` : ''}</span></h3>
    <table class="grid">
      <thead><tr><th>field</th><th>type</th><th>values / default</th></tr></thead>
      <tbody>
        {#each fields as [name, hint]}
          <tr>
            <td><code>{name}</code></td>
            <td>{hint.type}</td>
            <td class="muted">
              {hint.values ? hint.values.join(' | ') : ''}
              {hint.default !== undefined ? `default: ${hint.default}` : ''}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section>
    <h3>
      Records ({detail.recordCount})
      {#if detail.issues > 0}<span class="warn">· {detail.issues} field warnings</span>{/if}
    </h3>
    {#key path}
      <DataTable {rows} {columns} placeholder={`query… e.g. ${columns[1]?.key ?? 'field'}>0`}>
        {#snippet lead(r)}
          <button class="linkish" onclick={() => openRecord(String(r.slug))}>{r.title}</button>
          {#if r.status === 'review'}<em class="badge">review</em>{/if}
          <code class="slug">{r.slug}</code>
        {/snippet}
      </DataTable>
    {/key}
  </section>

  <section class="metasec">
    <h3>Meta</h3>
    {#if metaItems.length}
      <div class="metabar">
        {#each metaItems as m (m.path)}
          <button
            class="linkish"
            class:active={selectedMeta?.path === m.path}
            onclick={() => (selectedMeta = { path: m.path, language: m.language })}>{m.label}</button>
        {/each}
      </div>
      {#if selectedMeta}
        {#key selectedMeta.path}
          <MetaEditor path={selectedMeta.path} language={selectedMeta.language} />
        {/key}
      {/if}
    {:else}
      <p class="muted">No meta files.</p>
    {/if}
  </section>
</article>

<style>
  .metabar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 6px;
  }
  .metabar .active {
    text-decoration: underline;
    font-weight: 600;
  }
</style>
