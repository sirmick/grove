<script lang="ts">
  // App chrome above the nav tree: brand + space switcher + help/screenshot/collapse, then search.
  import { toBlob } from 'html-to-image'
  import { runSearch } from './db/search.svelte'
  import Icon from './icons/Icon.svelte'
  import { spaceState, switchSpace } from './space.svelte'
  import { showSearch } from './state.svelte'
  import { toggleTree } from './ui.svelte'

  let { onhelp }: { onhelp?: () => void } = $props()

  let q = $state('')
  function onInput() {
    void runSearch(q)
    showSearch()
  }

  let shot = $state('')
  let shotTimer = 0
  function flash(msg: string) {
    shot = msg
    if (shotTimer) clearTimeout(shotTimer)
    shotTimer = window.setTimeout(() => (shot = ''), 3000)
  }
  async function screenshot() {
    flash('capturing…')
    try {
      const blob = await toBlob(document.documentElement, {
        pixelRatio: window.devicePixelRatio || 1,
        cacheBust: false,
        filter: (node) => !(node instanceof HTMLElement && node.classList?.contains('shot')),
      })
      if (!blob) return flash('capture failed')
      const r = await fetch('/screenshot', { method: 'POST', body: blob })
      if (!r.ok) return flash(`save failed: ${r.status}`)
      flash(`saved ${(await r.text()).trim()}`)
    } catch (e) {
      flash(`error: ${(e as Error).message}`)
    }
  }
</script>

<div class="chrome">
  <div class="row">
    <span class="brand">grove</span>
    {#if spaceState.spaces.length > 1}
      <select
        class="spacesel"
        value={spaceState.current}
        onchange={(e) => switchSpace(e.currentTarget.value)}
        title="Switch space">
        {#each spaceState.spaces as s (s)}<option value={s}>{s}</option>{/each}
      </select>
    {/if}
    <span class="grow"></span>
    <button class="btn icon" title="Screenshot → PNG" onclick={screenshot}>
      <Icon name="camera" size={15} />
    </button>
    <button class="btn icon" title="Help — grove docs" onclick={() => onhelp?.()}>
      <Icon name="help-circle" size={16} />
    </button>
    <button class="btn icon" title="Collapse sidebar" onclick={toggleTree}>
      <Icon name="chevron-left" size={16} />
    </button>
  </div>

  {#if shot}<div class="shot">{shot}</div>{/if}

  <div class="searchbox">
    <Icon name="search" size={15} />
    <input type="search" placeholder="Search…" bind:value={q} oninput={onInput} />
  </div>
</div>

<style>
  .chrome {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .grow {
    flex: 1;
  }
  .brand {
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.5px;
  }
  .spacesel {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    height: var(--ctrl-h);
    padding: 0 6px;
    font-size: 13px;
    cursor: pointer;
    max-width: 110px;
  }
  .searchbox {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0 8px;
    height: var(--ctrl-h);
    color: var(--muted);
  }
  .searchbox input {
    background: transparent;
    border: 0;
    outline: 0;
    color: var(--text);
    width: 100%;
  }
  .shot {
    font-size: 12px;
    color: var(--muted);
  }
</style>
