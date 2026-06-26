<script lang="ts">
  import type { TreeNode } from '@grove/core'
  import { hasDraft } from '../db/drafts.svelte'
  import Icon from '../icons/Icon.svelte'
  import { activeTab, openCollection, openRecord } from '../state.svelte'
  import type { DragItem } from './dnd'
  import { isExpanded, setExpanded } from './expansion.svelte'
  import Self from './TreeNodeItem.svelte'
  import { dnd, isSelected, onDragLeave, onDragOver, onDragStart, onDrop, selectOnly, toggleSelect } from './treeDnd.svelte'

  let { node, depth }: { node: TreeNode; depth: number } = $props()
  const open = $derived(node.kind === 'collection' && isExpanded(node.path, depth))

  const leafIcon = (kind: string) =>
    kind === 'record' ? 'table-2' : kind === 'draft' ? 'file-clock' : 'file-text'

  // The drag payload for this row: a collection carries its path, a leaf its slug.
  const item = (): DragItem =>
    node.kind === 'collection' ? { type: 'collection', id: node.path } : { type: 'record', id: node.slug }

  // Modifier-click toggles multi-select (for dragging several at once) without opening; a plain
  // click opens and resets the selection to this row.
  function pick(e: MouseEvent, openIt: () => void) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      toggleSelect(item())
      return
    }
    selectOnly(item())
    openIt()
  }
</script>

{#if node.kind === 'collection'}
  <li>
    <button
      class="row col"
      class:active={activeTab()?.kind === 'collection' && activeTab()?.ref === node.path}
      class:selected={isSelected(node.path)}
      class:drop={dnd.dropTarget === node.path}
      data-collection={node.path}
      draggable="true"
      ondragstart={(e) => onDragStart(e, item())}
      ondragend={() => (dnd.dropTarget = null)}
      ondragover={(e) => onDragOver(e, node.path)}
      ondragleave={() => onDragLeave(node.path)}
      ondrop={(e) => onDrop(e, node.path)}
      style="padding-left: {6 + depth * 14}px"
      onclick={(e) =>
        pick(e, () => {
          setExpanded(node.path, !open)
          openCollection(node.path)
        })}>
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
      <Icon name={open ? 'folder-open' : 'folder'} size={15} />
      <span class="label">{node.name}</span>
    </button>
    {#if open}
      <ul>
        {#each node.children as child (child.kind === 'collection' ? child.path : child.slug)}
          <Self node={child} depth={depth + 1} />
        {/each}
      </ul>
    {/if}
  </li>
{:else}
  <li>
    <button
      class="row leaf status-{node.status}"
      class:active={activeTab()?.kind === 'doc' && activeTab()?.ref === node.slug}
      class:selected={isSelected(node.slug)}
      data-record={node.slug}
      draggable="true"
      ondragstart={(e) => onDragStart(e, item())}
      ondragend={() => (dnd.dropTarget = null)}
      style="padding-left: {22 + depth * 14}px"
      onclick={(e) => pick(e, () => openRecord(node.slug))}>
      <Icon name={leafIcon(node.kind)} size={14} />
      <span class="label">{node.title}</span>
      {#if hasDraft(`${node.slug}.md`)}<em class="badge">draft</em>
      {:else if node.status === 'review'}<em class="badge">review</em>{/if}
    </button>
  </li>
{/if}

<style>
  .row.col.drop {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
    background: var(--panel-2);
  }
  .row.selected {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
</style>
