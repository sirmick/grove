<script lang="ts">
  import type { TreeNode } from '@grove/core'
  import { untrack } from 'svelte'
  import { hasDraft } from '../db/drafts.svelte'
  import Icon from '../icons/Icon.svelte'
  import { activeTab, openCollection, openRecord } from '../state.svelte'
  import Self from './TreeNodeItem.svelte'

  let { node, depth }: { node: TreeNode; depth: number } = $props()
  let open = $state(untrack(() => depth < 1))

  const leafIcon = (kind: string) =>
    kind === 'record' ? 'table-2' : kind === 'draft' ? 'file-clock' : 'file-text'
</script>

{#if node.kind === 'collection'}
  <li>
    <button
      class="row col"
      class:active={activeTab()?.kind === 'collection' && activeTab()?.ref === node.path}
      style="padding-left: {6 + depth * 14}px"
      onclick={() => {
        open = !open
        openCollection(node.path)
      }}>
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
      style="padding-left: {22 + depth * 14}px"
      onclick={() => openRecord(node.slug)}>
      <Icon name={leafIcon(node.kind)} size={14} />
      <span class="label">{node.title}</span>
      {#if hasDraft(`${node.slug}.md`)}<em class="badge">draft</em>
      {:else if node.status === 'review'}<em class="badge">review</em>{/if}
    </button>
  </li>
{/if}
