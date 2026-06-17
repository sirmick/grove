<script lang="ts">
  import { type TreeNode, buildTree, parseFrontmatter, proseOf, titleOf } from '@grove/core'
  import { helpCorpus } from '../../generated/help'
  import { diagrams } from '../diagrams'
  import { renderMarkdown } from '../md'

  // Read-only docs viewer over the bundled help space (spaces/docs). No client/server/space deps —
  // it runs the pure read engine over a static corpus. Wikilinks render as plain text here.
  let { onclose }: { onclose: () => void } = $props()

  const tree = buildTree(helpCorpus)
  let selected = $state<string>('') // slug; '' = the space overview

  const doc = $derived.by(() => {
    const raw = selected ? helpCorpus[`${selected}.md`] : helpCorpus['_grove/overview.md']
    if (!raw) return null
    const { body } = parseFrontmatter(raw)
    return {
      title: selected ? titleOf(body, selected) : 'grove documentation',
      html: renderMarkdown(proseOf(body)),
    }
  })
</script>

<div
  class="scrim"
  role="button"
  tabindex="-1"
  aria-label="Close help"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
></div>

<aside class="help">
  <header>
    <span>📖 Help — grove docs</span>
    <button class="x" title="Close" onclick={onclose}>×</button>
  </header>
  <div class="cols">
    <nav class="htree">
      <button class="leaf" class:active={selected === ''} onclick={() => (selected = '')}>Overview</button>
      {@render branch(tree, 0)}
    </nav>
    <article class="hdoc" use:diagrams={selected}>
      {#if doc}
        <h1>{doc.title}</h1>
        {@html doc.html}
      {:else}
        <p class="muted">Select a page.</p>
      {/if}
    </article>
  </div>
</aside>

{#snippet branch(nodes: TreeNode[], depth: number)}
  <ul>
    {#each nodes as n (n.kind === 'collection' ? n.path : n.slug)}
      {#if n.kind === 'collection'}
        <li class="grp" style="padding-left:{6 + depth * 12}px">{n.name}</li>
        {@render branch(n.children, depth + 1)}
      {:else}
        <li>
          <button
            class="leaf"
            class:active={selected === n.slug}
            style="padding-left:{16 + depth * 12}px"
            onclick={() => (selected = n.slug)}>{n.title}</button>
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 40;
    border: 0;
  }
  .help {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(820px, 92vw);
    background: var(--panel);
    border-left: 1px solid var(--border);
    z-index: 41;
    display: flex;
    flex-direction: column;
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.3);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
  }
  .x {
    background: none;
    border: 0;
    color: var(--muted);
    font-size: 20px;
    cursor: pointer;
  }
  .cols {
    display: flex;
    min-height: 0;
    flex: 1;
  }
  .htree {
    width: 220px;
    border-right: 1px solid var(--border);
    overflow: auto;
    padding: 8px 4px;
  }
  .htree :global(ul) {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .grp {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    padding: 8px 6px 2px;
  }
  .leaf {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    color: var(--text);
    padding: 4px 6px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
  }
  .leaf:hover {
    background: var(--panel-2);
  }
  .leaf.active {
    background: var(--panel-2);
    font-weight: 600;
  }
  .hdoc {
    flex: 1;
    overflow: auto;
    padding: 18px 24px;
  }
</style>
