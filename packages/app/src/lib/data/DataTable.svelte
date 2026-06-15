<script lang="ts">
  import { type Row, runQuery } from '@grove/core'
  import type { Snippet } from 'svelte'

  // A query box + sortable table over plain typed rows. The same pure engine the CLI uses.
  let {
    rows,
    columns,
    placeholder = 'query… e.g. field>0',
    lead,
  }: {
    rows: Row[]
    columns: { key: string; label?: string; numeric?: boolean }[]
    placeholder?: string
    lead?: Snippet<[Row]> // custom render for the first cell (e.g. a clickable title)
  } = $props()

  let where = $state('')
  let sort = $state('')

  const result = $derived.by(() => {
    try {
      const r = runQuery(rows, { where: where.trim() || undefined, sort: sort || undefined })
      return { rows: r.rows, count: r.count, error: '' }
    } catch (e) {
      return { rows: [] as Row[], count: 0, error: (e as Error).message }
    }
  })

  function toggleSort(col: string) {
    sort = sort === col ? `-${col}` : sort === `-${col}` ? '' : col
  }
  const mark = (col: string) => (sort === col ? ' ▲' : sort === `-${col}` ? ' ▼' : '')
</script>

<div class="qbar">
  <input class="qbox" type="text" {placeholder} bind:value={where} />
  <span class="muted">
    {result.error ? result.error : `${result.count} match${result.count === 1 ? '' : 'es'}`}
  </span>
</div>

{#if result.rows.length}
  <table class="grid data">
    <thead>
      <tr>
        {#each columns as col (col.key)}
          <th class:num={col.numeric}>
            <button class="colh" onclick={() => toggleSort(col.key)}>{col.label ?? col.key}{mark(col.key)}</button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each result.rows as r, i (r.slug ?? i)}
        <tr>
          {#each columns as col, ci (col.key)}
            {#if ci === 0 && lead}
              <td>{@render lead(r)}</td>
            {:else}
              <td class:num={col.numeric ?? typeof r[col.key] === 'number'}>{r[col.key] ?? ''}</td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
{:else if !result.error}
  <p class="muted">No matching records.</p>
{/if}

<style>
  .qbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .qbox {
    flex: 1;
    max-width: 420px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 6px 10px;
    font-family: var(--mono, monospace);
    font-size: 13px;
  }
  table.data {
    width: 100%;
  }
  table.data td.num,
  table.data th.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .colh {
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0;
  }
  .colh:hover {
    text-decoration: underline;
  }
</style>
