<script lang="ts">
  import type { Row } from '@grove/core'
  import { syncState } from '../db/sync.svelte'
  import DataTable from '../data/DataTable.svelte'

  // The respin journal (db/respins.json) dog-fooded as a queryable collection. Derived, read-only.
  let rows = $state<Row[]>([])

  $effect(() => {
    void syncState.builtAt // refetch whenever a new respin lands
    fetch('/db/respins.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<Record<string, unknown>>) => {
        rows = data
          .map((d, i) => ({
            slug: `respin-${i}`,
            status: d.status,
            headCommit: String(d.headCommit ?? '').slice(0, 8),
            builtAt: d.builtAt,
            durationMs: d.durationMs,
            warnings: Array.isArray(d.warnings) ? d.warnings.length : 0,
            outputs: Array.isArray(d.outputs)
              ? d.outputs
                  .map((o) =>
                    typeof o === 'object' && o !== null && 'name' in o ? String(o.name) : '',
                  )
                  .filter(Boolean)
                  .join(', ')
              : '',
            error: d.error ?? '',
          }))
          .reverse() // newest first
      })
      .catch(() => {
        rows = []
      })
  })

  const columns = [
    { key: 'status' },
    { key: 'headCommit' },
    { key: 'builtAt' },
    { key: 'durationMs', label: 'ms', numeric: true },
    { key: 'warnings', numeric: true },
    { key: 'outputs' },
    { key: 'error' },
  ]
</script>

<article class="page">
  <h1>Respin log</h1>
  <p class="muted">Every build of the space, newest first — the watcher/commit cycle, dog-fooded as a collection.</p>
  {#key rows.length}
    <DataTable {rows} {columns} placeholder="query… e.g. status!=pass or durationMs>50" />
  {/key}
</article>
