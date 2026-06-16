<script lang="ts">
  import { composeMarkdown, dirOf, proseOf } from '@grove/core'
  import { hasDraft, setDraft } from '../db/drafts.svelte'
  import { commitAll, currentHead } from '../db/sync.svelte'
  import { grove } from '../grove/client'
  import Icon from '../icons/Icon.svelte'
  import { renderMarkdown } from '../md'
  import { openRecord } from '../state.svelte'

  let { slug }: { slug: string } = $props()

  const rec = $derived(grove.records.read(slug))
  const links = $derived(grove.links.of(slug))

  const SYSTEM = new Set(['slug', 'title', 'path', 'status', 'lastEdited', 'gitCommit', 'gitMessage'])
  const fields = $derived(
    rec ? Object.entries(rec.meta).filter(([k, v]) => !SYSTEM.has(k) && v !== undefined) : [],
  )

  // Promote a review draft → verified: recompose without `_status` and commit through the seam.
  function promote() {
    const r = grove.records.read(slug)
    if (!r) return
    const f = Object.keys(grove.schema.get(dirOf(slug)).fields).map(
      (k) => [k, r.meta[k]] as [string, unknown],
    )
    const fm = { ...r.frontmatter }
    delete fm._status
    setDraft(
      `${slug}.md`,
      composeMarkdown({ title: r.meta.title, fields: f, body: proseOf(r.body), frontmatter: fm }),
      currentHead(),
    )
    void commitAll()
  }
</script>

{#if rec}
  <article class="page doc">
    {#if hasDraft(`${slug}.md`)}
      <span class="banner draftbanner">Unsaved draft — Save in the top bar</span>
    {:else if rec.meta.status === 'review'}
      <div class="dochead">
        <span class="banner">Draft — ingested, pending review</span>
        <button class="btn" onclick={promote}><Icon name="check" size={15} /> Promote</button>
      </div>
    {/if}

    <h1>{rec.meta.title}</h1>
    <code class="slug">{rec.meta.slug}</code>

    {#if fields.length}
      <dl class="fields">
        {#each fields as [k, v]}
          <div class="field"><dt>{k}</dt><dd>{String(v)}</dd></div>
        {/each}
      </dl>
    {/if}

    <div class="body">{@html renderMarkdown(proseOf(rec.body))}</div>

    <section class="links">
      <h3><Icon name="link" size={15} /> Links</h3>
      {#if links.out.length}
        <ul>
          {#each links.out as l}<li><button class="linkish" onclick={() => openRecord(l.dst)}>{l.display ?? l.dst}</button></li>{/each}
        </ul>
      {:else}<p class="muted">None</p>{/if}

      <h3>Backlinks</h3>
      {#if links.in.length}
        <ul>
          {#each links.in as l}<li><button class="linkish" onclick={() => openRecord(l.src)}>{l.src}</button></li>{/each}
        </ul>
      {:else}<p class="muted">None</p>{/if}
    </section>
  </article>
{:else}
  <p class="muted">Not found: {slug}</p>
{/if}

<style>
  .dochead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .draftbanner {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
