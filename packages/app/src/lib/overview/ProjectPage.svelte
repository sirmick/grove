<script lang="ts">
  import { copyText } from '../clipboard'
  import MetaEditor from '../editor/MetaEditor.svelte'
  import { diagrams } from '../diagrams'
  import { grove } from '../grove/client'
  import { renderMarkdown } from '../md'
  import { openLog } from '../state.svelte'
  import { parseActions } from './actions'

  // The space root, as a sibling above the collections — project-level overview + global _grove meta.
  const overview = $derived(grove.meta.get('_grove/overview.md') ?? '')
  const globals = $derived(
    grove.meta.globals().filter((p) => p !== '_grove/overview.md'),
  )
  // Frequent actions: a menu the `ai` assistant auto-maintains in _grove/actions.md (the recurring
  // things you ask it to do here). Copy one to re-run it in an ai session.
  const actions = $derived(parseActions(grove.meta.get('_grove/actions.md')))
  const langOf = (p: string): 'yaml' | 'markdown' => (/\.ya?ml$/.test(p) ? 'yaml' : 'markdown')

  let selected = $state<string | null>(null)
  let copied = $state<string | null>(null)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  function copyRequest(title: string, request: string) {
    copyText(request)
    copied = title
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied = null), 1500)
  }
</script>

<article class="page">
  <h1>Project</h1>
  {#if overview}
    <div class="overview" use:diagrams={overview}>{@html renderMarkdown(overview)}</div>
  {:else}
    <p class="muted">The space root. Project-wide schema bases, templates, prompts and rules live here.</p>
  {/if}

  {#if actions.length}
    <section class="actions">
      <h3>Frequent actions <span class="muted">· what you ask the AI to do here</span></h3>
      <ul class="actionlist">
        {#each actions as a (a.title)}
          <li>
            <div class="ahead">
              <span class="atitle">{a.title}</span>
              {#if a.count != null}<span class="badge" title="times asked">{a.count}×</span>{/if}
              <button class="copy" onclick={() => copyRequest(a.title, a.request || a.title)}>
                {copied === a.title ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            {#if a.request}
              <div class="areq">{@html renderMarkdown(a.request)}</div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
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

  .actionlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .actionlist li {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel-2);
    padding: 8px 10px;
  }
  .ahead {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .atitle {
    font-weight: 600;
  }
  .badge {
    font-size: 11px;
    color: var(--accent);
    background: var(--accent-bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 7px;
    line-height: 17px;
  }
  .copy {
    margin-left: auto;
    height: 22px;
    padding: 0 9px;
    font-size: 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--muted);
    cursor: pointer;
  }
  .copy:hover {
    color: var(--text);
    border-color: var(--accent);
  }
  .areq {
    margin-top: 4px;
    font-size: 13px;
    color: var(--muted);
  }
  .areq :global(p) {
    margin: 4px 0 0;
  }
</style>
