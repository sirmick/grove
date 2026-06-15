<script lang="ts">
  import { hasDraft } from './lib/db/drafts.svelte'
  import DocView from './lib/doc/DocView.svelte'
  import HelpPanel from './lib/help/HelpPanel.svelte'
  import CollectionPage from './lib/overview/CollectionPage.svelte'
  import LogView from './lib/overview/LogView.svelte'
  import ProjectPage from './lib/overview/ProjectPage.svelte'
  import SearchResults from './lib/search/SearchResults.svelte'
  import { activeTab, closeTab, setActive, tabsState } from './lib/state.svelte'
  import Terminal from './lib/Terminal.svelte'
  import TopBar from './lib/TopBar.svelte'
  import TreeView from './lib/tree/TreeView.svelte'

  const active = $derived(activeTab())
  let helpOpen = $state(false)
</script>

<div class="app">
  <TopBar onhelp={() => (helpOpen = true)} />
  <div class="body">
    <aside class="sidebar"><TreeView /></aside>
    <main class="center">
      <div class="tabstrip">
        {#each tabsState.tabs as t (t.id)}
          <div class="tab" class:active={t.id === tabsState.activeId}>
            <button class="tablabel" onclick={() => setActive(t.id)}>
              {t.title}{t.kind === 'doc' && hasDraft(`${t.ref}.md`) ? ' •' : ''}
            </button>
            <button class="tabclose" title="Close" onclick={() => closeTab(t.id)}>×</button>
          </div>
        {/each}
      </div>
      <div class="content">
        {#if active}
          {#key active.id}
            {#if active.kind === 'collection'}
              <CollectionPage path={active.ref} />
            {:else if active.kind === 'doc'}
              <DocView slug={active.ref} />
            {:else if active.kind === 'project'}
              <ProjectPage />
            {:else if active.kind === 'log'}
              <LogView />
            {:else}
              <SearchResults />
            {/if}
          {/key}
        {:else}
          <p class="muted empty">Open something from the tree.</p>
        {/if}
      </div>
    </main>
  </div>
  <footer class="terminal"><Terminal /></footer>
</div>

{#if helpOpen}<HelpPanel onclose={() => (helpOpen = false)} />{/if}

<style>
  .center {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }
  .tabstrip {
    display: flex;
    gap: 2px;
    padding: 6px 10px 0;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  .tab {
    display: flex;
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 6px 6px 0 0;
  }
  .tab.active {
    background: var(--panel-2);
  }
  .tablabel {
    background: none;
    border: 0;
    color: var(--text);
    padding: 5px 8px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
  }
  .tabclose {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 4px 6px;
  }
  .tabclose:hover {
    color: var(--warn);
  }
  .content {
    overflow: auto;
    padding: 22px 28px;
    flex: 1;
  }
  .empty {
    padding: 20px;
  }
  .terminal {
    height: 220px;
    padding: 0;
    overflow: hidden;
  }
</style>
