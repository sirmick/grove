<script lang="ts">
  import { grove } from '../grove/client'
  import Icon from '../icons/Icon.svelte'
  import { activeTab, openLog, openProject } from '../state.svelte'
  import TreeNodeItem from './TreeNodeItem.svelte'

  const tree = $derived(grove.collections.tree())
  let projOpen = $state(true)
  const isActive = (kind: string) => activeTab()?.kind === kind
</script>

<nav class="tree">
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
