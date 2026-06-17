<script lang="ts">
  import MetaEditor from '../editor/MetaEditor.svelte'
  import { diagrams } from '../diagrams'
  import { grove } from '../grove/client'
  import { renderMarkdown } from '../md'
  import { openLog } from '../state.svelte'

  // The space root, as a sibling above the collections — project-level overview + global _grove meta.
  const overview = $derived(grove.meta.get('_grove/overview.md') ?? '')
  const globals = $derived(
    grove.meta.globals().filter((p) => p !== '_grove/overview.md'),
  )
  const langOf = (p: string): 'yaml' | 'markdown' => (/\.ya?ml$/.test(p) ? 'yaml' : 'markdown')

  let selected = $state<string | null>(null)
</script>

<article class="page">
  <h1>Project</h1>
  {#if overview}
    <div class="overview" use:diagrams={overview}>{@html renderMarkdown(overview)}</div>
  {:else}
    <p class="muted">The space root. Project-wide schema bases, templates, prompts and rules live here.</p>
  {/if}

  <section>
    <h3>History</h3>
    <p><button class="linkish" onclick={openLog}>Open the respin log →</button></p>
  </section>

  <section class="metasec">
    <h3>Global meta <span class="muted">· _grove/</span></h3>
    {#if globals.length}
      <div class="metabar">
        {#each globals as p (p)}
          <button
            class="linkish"
            class:active={selected === p}
            onclick={() => (selected = p)}>{p.replace(/^_grove\//, '')}</button>
        {/each}
      </div>
      {#if selected}
        {#key selected}
          <MetaEditor path={selected} language={langOf(selected)} />
        {/key}
      {/if}
    {:else}
      <p class="muted">No global meta files.</p>
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
