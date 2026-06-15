<script lang="ts">
  import { composeMarkdown, dirOf, proseOf } from '@grove/core'
  import { hasDraft, setDraft } from '../db/drafts.svelte'
  import { commitAll, currentHead } from '../db/sync.svelte'
  import RecordEditor from '../editor/RecordEditor.svelte'
  import { grove } from '../grove/client'
  import Icon from '../icons/Icon.svelte'
  import { renderMarkdown } from '../md'
  import { openRecord } from '../state.svelte'

  let { slug }: { slug: string } = $props()

  let editing = $state(false)
  $effect(() => {
    void slug
    editing = false
  })

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

{#if editing}
  <RecordEditor {slug} ondone={() => (editing = false)} />
{:else if rec}
  <article class="page doc">
    <div class="dochead">
      <div>
        {#if hasDraft(`${slug}.md`)}
          <span class="banner draftbanner">Unsaved draft — Commit in the top bar</span>
        {:else if rec.meta.status === 'review'}
          <span class="banner">Draft — ingested, pending review</span>
        {/if}
      </div>
      <div class="acts">
        {#if rec.meta.status === 'review' && !hasDraft(`${slug}.md`)}
          <button class="editbtn" onclick={promote}>Promote</button>
        {/if}
        <button class="editbtn" onclick={() => (editing = true)}>Edit</button>
      </div>
    </div>

    <h1>{rec.meta.title}</h1>
    <code class="slug">{rec.meta.slug}</code>

    {#if fields.length}
      <div class="chips">
        {#each fields as [k, v]}<span class="chip"><b>{k}</b> {String(v)}</span>{/each}
      </div>
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
    align-items: flex-start;
    gap: 12px;
  }
  .editbtn {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 5px 14px;
    cursor: pointer;
  }
  .draftbanner {
    background: #15281f;
    border-color: var(--accent);
    color: var(--accent);
  }
  .acts {
    display: flex;
    gap: 8px;
  }
</style>
