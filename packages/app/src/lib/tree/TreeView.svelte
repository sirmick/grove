<script lang="ts">
  import BinTree from '../bin/BinTree.svelte'
  import { grove } from '../grove/client'
  import Icon from '../icons/Icon.svelte'
  import { activeTab, openLog, openProject } from '../state.svelte'
  import TreeNodeItem from './TreeNodeItem.svelte'
  import { clearSelection, dnd } from './treeDnd.svelte'

  const tree = $derived(grove.collections.tree())
  let projOpen = $state(true)
  const isActive = (kind: string) => activeTab()?.kind === kind
</script>

{#if dnd.error}<div class="dnd-msg" role="alert">{dnd.error}</div>{/if}

<!-- A bare click on the nav background (not on a row) clears the multi-select. -->
<nav class="tree" onclickcapture={(e) => { if (!(e.target as HTMLElement).closest('.row')) clearSelection() }}>
  <!-- bin: raw OS files, pinned above the semantic collection tree. -->
  <BinTree />
  <ul>
    <!-- Space root, as a sibling above the collections: project-level meta + the respin log. -->
    <li>
      <button
        class="prow"
        class:active={isActive('project')}
        onclick={() => {
          projOpen = !projOpen
          openProject()
        }}>
        <Icon name={projOpen ? 'chevron-down' : 'chevron-right'} size={13} />
        <Icon name="box" size={15} />
        <span class="label">Project</span>
      </button>
      {#if projOpen}
        <ul>
          <li>
            <button class="prow leaf" class:active={isActive('log')} onclick={openLog}>
              <Icon name="scroll-text" size={14} />
              <span class="label">Log</span>
            </button>
          </li>
        </ul>
      {/if}
    </li>

    {#each tree as node (node.kind === 'collection' ? node.path : node.slug)}
      <TreeNodeItem {node} depth={0} />
    {/each}
  </ul>
</nav>

<style>
  .dnd-msg {
    margin: 4px 8px;
    padding: 4px 8px;
    font-size: 12px;
    color: #ffd9d9;
    background: #5a1d1d;
    border: 1px solid #7a2a2a;
    border-radius: 5px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    background: none;
    border: 0;
    color: var(--text);
    padding: 4px 6px;
    cursor: pointer;
    text-align: left;
    border-radius: 5px;
  }
  .prow.leaf {
    padding-left: 22px;
  }
  .prow:hover {
    background: var(--panel-2);
  }
  .prow.active {
    background: var(--panel-2);
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
