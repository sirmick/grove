<script lang="ts">
  import { searchState } from '../db/search.svelte'
  import { openRecord } from '../state.svelte'
</script>

<article class="page">
  <h3>Search <span class="muted">· {searchState.query}</span></h3>
  {#if searchState.results.length}
    <ul class="records">
      {#each searchState.results as r (r.slug)}
        <li>
          <button class="linkish" onclick={() => openRecord(r.slug)}>{r.title}</button>
          <code class="slug">{r.slug}</code>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">No results.</p>
  {/if}
</article>
