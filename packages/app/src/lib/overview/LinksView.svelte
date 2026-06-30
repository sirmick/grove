<script lang="ts">
  import { parseLinks, proseOf, type LinkEdge } from '@grove/core'
  import { grove } from '../grove/client'
  import Icon from '../icons/Icon.svelte'
  import { renderMarkdown } from '../md'
  import { openRecord } from '../state.svelte'
  import Graph3D from './Graph3D.svelte'

  interface LinkRow {
    slug: string
    title: string
    out: LinkEdge[]
    in: LinkEdge[]
  }

  interface GraphNode extends LinkRow {
    degree: number
    dim: boolean
    related: boolean
  }

  interface GraphEdge {
    key: string
    src: string
    dst: string
    active: boolean
  }

  let q = $state('')
  let selected = $state<string | null>(null)
  let popupOpen = $state(true)

  const rows = $derived.by<LinkRow[]>(() => {
    const slugs = grove.search.slugs()
    if (grove.records.exists('README')) slugs.unshift('README')
    const unique = [...new Set(slugs)]
    const home = grove.records.read('README')
    const homeOut = home ? parseLinks('README', home.body) : []
    const homeBacklinks = new Map<string, LinkEdge[]>()
    for (const edge of homeOut) {
      const list = homeBacklinks.get(edge.dst) ?? []
      list.push(edge)
      homeBacklinks.set(edge.dst, list)
    }

    return unique.map((slug) => {
      const rec = grove.records.read(slug)
      const links = grove.links.of(slug)
      const out = slug === 'README' ? homeOut : links.out
      const fromHome = slug === 'README' ? [] : (homeBacklinks.get(slug) ?? [])
      return { slug, title: rec?.meta.title ?? slug, out, in: [...links.in, ...fromHome] }
    })
  })

  const filtered = $derived.by(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.slug.toLowerCase().includes(needle) ||
        r.title.toLowerCase().includes(needle) ||
        r.out.some((l) => l.dst.toLowerCase().includes(needle)) ||
        r.in.some((l) => l.src.toLowerCase().includes(needle)),
    )
  })

  const homeRow = $derived(rows.find((r) => r.slug === 'README'))
  const active = $derived(
    rows.find((r) => r.slug === selected) ??
      (q.trim() ? filtered[0] : homeRow) ??
      filtered[0] ??
      rows[0],
  )
  const activeRecord = $derived(active ? grove.records.read(active.slug) : undefined)
  const activeBody = $derived(activeRecord ? proseOf(activeRecord.body) : '')
  const activeHtml = $derived(activeRecord ? renderMarkdown(activeBody, activeRecord.meta.slug) : '')
  const totalLinks = $derived(rows.reduce((n, r) => n + r.out.length, 0))
  const linkedRecords = $derived(rows.filter((r) => r.out.length || r.in.length).length)
  const orphanCount = $derived(rows.filter((r) => r.in.length === 0).length)

  const graph = $derived.by(() => {
    const activeSlug = active?.slug ?? ''
    const visible = rows.filter((r) => r.out.length || r.in.length)
    const candidates = (visible.length ? visible : rows).toSorted((a, b) => {
      const ad = a.out.length + a.in.length
      const bd = b.out.length + b.in.length
      return bd - ad || a.title.localeCompare(b.title)
    })
    const related = new Set<string>(activeSlug ? [activeSlug] : [])
    if (activeSlug) {
      const row = rows.find((r) => r.slug === activeSlug)
      for (const l of row?.out ?? []) related.add(l.dst)
      for (const l of row?.in ?? []) related.add(l.src)
    }
    const candidateMap = new Map(candidates.map((r) => [r.slug, r]))
    const activeRow = rows.find((r) => r.slug === activeSlug)
    if (activeRow) {
      candidateMap.set(activeRow.slug, activeRow)
      for (const l of activeRow.out) {
        const row = rows.find((r) => r.slug === l.dst)
        if (row) candidateMap.set(row.slug, row)
      }
      for (const l of activeRow.in) {
        const row = rows.find((r) => r.slug === l.src)
        if (row) candidateMap.set(row.slug, row)
      }
    }

    const nodes = new Map<string, GraphNode>()
    for (const r of candidateMap.values()) {
      const degree = r.out.length + r.in.length
      const isRelated = !activeSlug || related.has(r.slug)
      nodes.set(r.slug, {
        ...r,
        degree,
        dim: Boolean(activeSlug && !isRelated),
        related: isRelated,
      })
    }
    const edges: GraphEdge[] = []
    for (const r of rows) {
      const src = nodes.get(r.slug)
      if (!src) continue
      r.out.forEach((l, i) => {
        const dst = nodes.get(l.dst)
        if (!dst) return
        edges.push({
          key: `${r.slug}->${l.dst}:${i}`,
          src: r.slug,
          dst: l.dst,
          active: !activeSlug || r.slug === activeSlug || l.dst === activeSlug,
        })
      })
    }
    return { nodes: [...nodes.values()], edges }
  })

  function choose(slug: string) {
    selected = slug
    popupOpen = true
  }

  function onPopupClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a.wikilink, a.rellink')
    if (!a) return
    const target = (a as HTMLElement).dataset.slug
    if (!target) return
    e.preventDefault()
    choose(target)
  }
</script>

<article class="page linksview">
  <h1>Links</h1>
  <p class="muted">
    Grove's parsed link graph across wikilinks and relative Markdown links.
  </p>

  <section class="summary" aria-label="Link summary">
    <div><strong>{rows.length}</strong><span>records</span></div>
    <div><strong>{totalLinks}</strong><span>links</span></div>
    <div><strong>{linkedRecords}</strong><span>connected</span></div>
    <div><strong>{orphanCount}</strong><span>orphans</span></div>
  </section>

  <div class="qbar">
    <Icon name="search" size={15} />
    <input type="search" placeholder="Filter links..." bind:value={q} />
  </div>

  <div class="map-shell">
    <Graph3D
      nodes={graph.nodes}
      edges={graph.edges}
      activeSlug={active?.slug ?? ''}
      onselect={choose}
      onopen={openRecord} />

    {#if active && activeRecord && popupOpen}
      <aside class="preview" aria-live="polite">
        <div class="preview-head">
          <div>
            <h2>{active.title}</h2>
            <code>{active.slug}</code>
          </div>
          <div class="preview-actions">
            <button class="btn" onclick={() => openRecord(active.slug)}>
              <Icon name="file-text" size={15} /> Open
            </button>
            <button class="btn icon" aria-label="Close preview" onclick={() => (popupOpen = false)}>
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="preview-body" onclick={onPopupClick}>
          {#if activeBody}
            {@html activeHtml}
          {:else}
            <p class="muted">No body content.</p>
          {/if}
        </div>
      </aside>
    {/if}
  </div>

  <section class="layout">
    <div class="records" aria-label="Records">
      {#each filtered as r (r.slug)}
        <button class:active={active?.slug === r.slug} onclick={() => choose(r.slug)}>
          <span class="title">{r.title}</span>
          <span class="slug">{r.slug}</span>
          <span class="counts">
            <span title="outgoing links"><Icon name="link" size={12} /> {r.out.length}</span>
            <span title="backlinks">in {r.in.length}</span>
          </span>
        </button>
      {:else}
        <p class="muted">No matching records.</p>
      {/each}
    </div>

    {#if active}
      <div class="detail">
        <div class="detailhead">
          <div>
            <h2>{active.title}</h2>
            <code class="slug">{active.slug}</code>
          </div>
          <button class="btn" onclick={() => openRecord(active.slug)}>
            <Icon name="file-text" size={15} /> Open
          </button>
        </div>

        <div class="cols">
          <section>
            <h3><Icon name="link" size={15} /> Outgoing</h3>
            {#if active.out.length}
              <ul>
                {#each active.out as l, i (`${l.dst}:${i}`)}
                  <li>
                    <button class="linkish" onclick={() => openRecord(l.dst)}>{l.display ?? l.dst}</button>
                    <code>{l.dst}</code>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="muted">No outgoing links.</p>
            {/if}
          </section>

          <section>
            <h3>Backlinks</h3>
            {#if active.in.length}
              <ul>
                {#each active.in as l, i (`${l.src}:${i}`)}
                  <li>
                    <button class="linkish" onclick={() => openRecord(l.src)}>{l.src}</button>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="muted">No backlinks.</p>
            {/if}
          </section>
        </div>
      </div>
    {/if}
  </section>
</article>

<style>
  .linksview {
    max-width: 1120px;
  }
  .map-shell {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    margin-bottom: 14px;
  }
  .preview {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    width: min(440px, calc(100% - 24px));
    max-height: min(520px, calc(100% - 24px));
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 18px 44px var(--shadow);
  }
  .preview-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--border);
  }
  .preview-head h2 {
    margin: 0 0 2px;
    color: var(--text);
    font-size: 18px;
    line-height: 1.22;
  }
  .preview-head code {
    color: var(--muted);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .preview-actions {
    display: flex;
    flex: none;
    gap: 6px;
  }
  .preview .btn {
    background: var(--panel-2);
    border-color: var(--border);
    color: var(--text);
  }
  .preview .btn:hover {
    border-color: var(--accent);
  }
  .preview-body {
    min-height: 0;
    overflow: auto;
    padding: 6px 14px 14px;
    color: var(--text);
    font-size: 14px;
    line-height: 1.45;
  }
  .preview-body :global(h1),
  .preview-body :global(h2),
  .preview-body :global(h3) {
    color: var(--text);
  }
  .preview-body :global(a.wikilink),
  .preview-body :global(a.rellink) {
    color: var(--accent-2);
    text-decoration: none;
    border-bottom: 1px dotted var(--accent-2);
    cursor: pointer;
  }
  .preview-body :global(a.wikilink:hover),
  .preview-body :global(a.rellink:hover) {
    border-bottom-style: solid;
  }
  .preview-body :global(img) {
    max-width: 100%;
    height: auto;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 14px 0;
  }
  .summary div {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel-2);
    padding: 8px 10px;
  }
  .summary strong {
    display: block;
    font-size: 20px;
  }
  .summary span {
    color: var(--muted);
    font-size: 12px;
  }
  .qbar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--muted);
    height: var(--ctrl-h);
    padding: 0 8px;
    max-width: 420px;
    margin-bottom: 12px;
  }
  .qbar input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    color: var(--text);
    outline: 0;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .records {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    max-height: 62vh;
    overflow: auto;
  }
  .records button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 3px 8px;
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    padding: 8px 10px;
    text-align: left;
  }
  .records button:hover,
  .records button.active {
    background: var(--panel-2);
  }
  .records button.active {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .records .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .records .slug {
    grid-column: 1 / -1;
  }
  .counts {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .counts span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .detail {
    min-width: 0;
  }
  .detailhead {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
    margin-bottom: 14px;
  }
  .detailhead h2 {
    margin: 0 0 3px;
    font-size: 22px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .cols section {
    min-width: 0;
  }
  .cols h3 {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    border-bottom: 1px solid var(--border);
    padding: 7px 0;
  }
  li code {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  @media (max-width: 760px) {
    .summary,
    .layout,
    .cols {
      grid-template-columns: 1fr;
    }
    .records {
      max-height: 300px;
    }
  }
</style>
