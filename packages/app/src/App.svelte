<script lang="ts">
  import Chrome from './lib/Chrome.svelte'
  import DocView from './lib/doc/DocView.svelte'
  import RecordEditor from './lib/editor/RecordEditor.svelte'
  import HelpPanel from './lib/help/HelpPanel.svelte'
  import Icon from './lib/icons/Icon.svelte'
  import CollectionPage from './lib/overview/CollectionPage.svelte'
  import LogView from './lib/overview/LogView.svelte'
  import ProjectPage from './lib/overview/ProjectPage.svelte'
  import SearchResults from './lib/search/SearchResults.svelte'
  import { activeTab } from './lib/state.svelte'
  import TabBar from './lib/TabBar.svelte'
  import Terminal from './lib/Terminal.svelte'
  import TreeView from './lib/tree/TreeView.svelte'
  import { editor, setTermH, setTreeW, toggleTerm, toggleTree, ui } from './lib/ui.svelte'

  const active = $derived(activeTab())
  let helpOpen = $state(false)

  // Leaving a tab drops edit mode (each doc opens read-only).
  $effect(() => {
    void active?.id
    editor.editing = false
  })

  // Drag-to-resize: tree width = pointer x; terminal height = distance from the bottom.
  function drag(set: (px: number) => void, fromBottom = false) {
    return (e: PointerEvent) => {
      e.preventDefault()
      document.body.style.userSelect = 'none'
      const move = (ev: PointerEvent) => set(fromBottom ? window.innerHeight - ev.clientY : ev.clientX)
      const up = () => {
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
  }
  const dragTerm = drag(setTermH, true)
  function termHeadDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return // let the collapse chevron click through
    dragTerm(e)
  }
</script>

<div class="app" style="--tree-w:{ui.treeW}px; --term-h:{ui.termH}px">
  <div class="main">
    {#if ui.treeOpen}
      <div class="left">
        <Chrome onhelp={() => (helpOpen = true)} />
        <div class="tree-scroll"><TreeView /></div>
      </div>
      <div class="rz-v" role="separator" aria-label="Resize sidebar" onpointerdown={drag(setTreeW)}></div>
    {:else}
      <button class="rail" title="Show sidebar" onclick={toggleTree}><Icon name="chevron-right" size={16} /></button>
    {/if}

    <main class="right">
      <TabBar />
      <div class="content" class:flush={active?.kind === 'doc' && editor.editing}>
        {#if active}
          {#key active.id}
            {#if active.kind === 'collection'}
              <CollectionPage path={active.ref} />
            {:else if active.kind === 'doc'}
              {#if editor.editing}<RecordEditor slug={active.ref} />{:else}<DocView slug={active.ref} />{/if}
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

  {#if ui.termOpen}
    <footer class="terminal">
      <div class="term-head" role="separator" aria-label="Resize terminal" onpointerdown={termHeadDown}>
        <span class="th-label">terminal</span>
        <span class="grow"></span>
        <button class="th-btn" title="Collapse terminal" onclick={toggleTerm}><Icon name="chevron-down" size={14} /></button>
      </div>
      <div class="term-body"><Terminal /></div>
    </footer>
  {:else}
    <button class="term-collapsed" title="Show terminal" onclick={toggleTerm}>
      <Icon name="chevron-up" size={14} /> terminal
    </button>
  {/if}
</div>

{#if helpOpen}<HelpPanel onclose={() => (helpOpen = false)} />{/if}

<style>
  .main {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .left {
    width: var(--tree-w, 260px);
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    min-height: 0;
  }
  .tree-scroll {
    flex: 1;
    overflow: auto;
    padding: 8px 0;
  }
  .rail {
    flex: none;
    width: 18px;
    background: var(--panel);
    border: 0;
    border-right: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    display: flex;
    justify-content: center;
    padding-top: 8px;
  }
  .rail:hover {
    color: var(--accent);
  }
  .right {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 22px 28px;
  }
  .content.flush {
    padding: 0;
    overflow: hidden;
    display: flex;
  }
  .empty {
    padding: 20px;
  }
  .terminal {
    height: var(--term-h, 200px);
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--term-bg);
    border-top: 1px solid var(--border);
    overflow: hidden;
  }
  .term-head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 8px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    cursor: row-resize;
    user-select: none;
  }
  .th-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .grow {
    flex: 1;
  }
  .th-btn {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    display: flex;
    padding: 2px;
  }
  .th-btn:hover {
    color: var(--accent);
  }
  .term-body {
    flex: 1;
    min-height: 0;
    padding: 6px 10px;
  }
  .term-collapsed {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    background: var(--panel);
    border: 0;
    border-top: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .term-collapsed:hover {
    color: var(--accent);
  }
</style>
