<script lang="ts">
  // The terminal tab strip + stacked panes. Every tab in the current space is mounted and kept alive
  // (hidden panes use display:none so scrollback survives switching); tabs from other spaces appear
  // dimmed and clicking one switches the app to that space. New terminals open in the current space.
  import { currentSpace } from '../space.svelte'
  import Terminal from './Terminal.svelte'
  import { activateTerm, closeTerm, currentSpaceTabs, cycleTerm, newTerm, terms } from './terminals.svelte'

  // Reactive: on a first-ever load the space resolves only after bootSpace() pins the cookie, so
  // capturing it once would render other-space tabs wrong. $derived re-reads when it settles.
  const space = $derived(currentSpace())

  // Tab/window shortcuts, handed to each pane's xterm key handler so they work while the terminal is
  // focused. preventDefault stops the browser claiming Ctrl+Shift+T / Ctrl+Tab.
  function tabKey(ev: KeyboardEvent): boolean {
    if (ev.type !== 'keydown') return true
    const k = ev.key.toLowerCase()
    if (ev.ctrlKey && ev.shiftKey && k === 't') {
      ev.preventDefault()
      newTerm()
      return false
    }
    if (ev.ctrlKey && ev.shiftKey && k === 'w') {
      ev.preventDefault()
      if (terms.activeSid) closeTerm(terms.activeSid)
      return false
    }
    if (ev.ctrlKey && ev.key === 'Tab') {
      ev.preventDefault()
      cycleTerm(ev.shiftKey ? -1 : 1)
      return false
    }
    return true
  }
</script>

<div class="ttabs">
  <div class="strip" role="tablist">
    {#each terms.tabs as t (t.sid)}
      <div class="ttab" class:active={t.sid === terms.activeSid} class:other={t.space !== space}>
        <button
          class="tl"
          role="tab"
          aria-selected={t.sid === terms.activeSid}
          title={t.space !== space ? `terminal in space “${t.space}” — click to switch` : t.title}
          onclick={() => activateTerm(t.sid)}>
          {#if t.space !== space}<span class="sp">{t.space}/</span>{/if}{t.title}
        </button>
        <button class="tc" title="Close terminal" onclick={() => closeTerm(t.sid)}>×</button>
      </div>
    {/each}
    <button class="tnew" title="New terminal (Ctrl+Shift+T)" onclick={() => newTerm()}>+</button>
  </div>

  <div class="panes">
    {#each currentSpaceTabs() as t (t.sid)}
      <div class="pane" style:display={t.sid === terms.activeSid ? 'block' : 'none'}>
        <Terminal sid={t.sid} active={t.sid === terms.activeSid} onTabKey={tabKey} />
      </div>
    {/each}
  </div>
</div>

<style>
  .ttabs {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 4px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    flex: none;
  }
  .ttab {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    flex: none;
  }
  .ttab.active {
    border-color: var(--accent);
    background: var(--panel-2);
  }
  .ttab.other {
    opacity: 0.55;
  }
  .tl {
    background: none;
    border: 0;
    color: var(--text);
    padding: 2px 8px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }
  .sp {
    color: var(--muted);
  }
  .tc {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 6px;
  }
  .tc:hover {
    color: var(--warn);
  }
  .tnew {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 2px 8px;
  }
  .tnew:hover {
    color: var(--accent);
  }
  .panes {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .pane {
    position: absolute;
    inset: 0;
  }
</style>
