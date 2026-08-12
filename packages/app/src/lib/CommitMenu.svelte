<script lang="ts">
  // The commit control: a one-click `Commit (n)` primary button plus a chevron that opens a review
  // popover — the pending files (each discardable), an optional commit message, and Commit /
  // Discard all. The button commits every draft with a default message; the popover is for
  // reviewing what's staged, dropping individual drafts, or writing a message first. Committing is
  // local git history — PublishButton (next to it) is what pushes it to the remote.
  import { clearAllDrafts, clearDraft, draftCount, draftPaths } from './db/drafts.svelte'
  import { commitAll, isBusy, syncState } from './db/sync.svelte'
  import Icon from './icons/Icon.svelte'

  let menu = $state<HTMLDetailsElement>()
  let message = $state('')

  const close = () => {
    if (menu) menu.open = false
  }

  // Draft paths are `slug.md` (records) or `dir/_grove/x.yaml` (meta); show a readable label.
  const label = (p: string) => p.replace(/\.md$/, '')

  async function commit() {
    close()
    const msg = message.trim()
    message = ''
    await commitAll(msg || undefined)
  }

  function discardAll() {
    if (window.confirm(`Discard all ${draftCount()} unsaved change(s)? This cannot be undone.`)) {
      clearAllDrafts()
      close()
    }
  }
</script>

<div class="savegroup">
  <button
    class="btn primary save"
    disabled={draftCount() === 0 || isBusy()}
    title={syncState.status === 'error'
      ? syncState.message
      : 'Commit all drafts to the space’s git history'}
    onclick={() => void commitAll()}>
    <Icon name="save" size={15} /> Commit ({draftCount()})
  </button>
  <details class="commitmenu" bind:this={menu}>
    <summary
      class="btn caret"
      class:disabled={draftCount() === 0}
      title="Review pending changes">
      <Icon name="chevron-down" size={14} />
    </summary>
    <div class="panel">
      <div class="phead">Pending changes ({draftCount()})</div>
      {#if draftCount() === 0}
        <p class="empty">Nothing to commit.</p>
      {:else}
        <ul class="files">
          {#each draftPaths() as p (p)}
            <li>
              <span class="path" title={p}>{label(p)}</span>
              <button class="discard" title="Discard this change" onclick={() => clearDraft(p)}>
                <Icon name="x" size={13} />
              </button>
            </li>
          {/each}
        </ul>
        <textarea
          class="msg"
          rows="2"
          placeholder="Commit message (optional)"
          bind:value={message}></textarea>
        <div class="actions">
          <button class="btn ghost danger" onclick={discardAll}>Discard all</button>
          <button class="btn primary" disabled={isBusy()} onclick={() => void commit()}>
            <Icon name="save" size={14} /> Commit
          </button>
        </div>
      {/if}
    </div>
  </details>
</div>

<style>
  .savegroup {
    display: flex;
    align-items: stretch;
    gap: 1px;
  }
  .save {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .commitmenu {
    position: relative;
  }
  .commitmenu summary {
    list-style: none;
    height: 100%;
    padding: 0 5px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  .commitmenu summary::-webkit-details-marker {
    display: none;
  }
  .caret.disabled {
    opacity: 0.45;
    pointer-events: none;
  }
  .panel {
    position: absolute;
    right: 0;
    margin-top: 4px;
    width: 300px;
    max-width: 80vw;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px;
    z-index: 10;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  }
  .phead {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }
  .empty {
    font-size: 13px;
    color: var(--muted);
    margin: 4px 0;
  }
  .files {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    max-height: 200px;
    overflow: auto;
  }
  .files li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    border-radius: 4px;
  }
  .files li:hover {
    background: var(--panel-2);
  }
  .path {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .discard {
    flex: none;
    display: flex;
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
  }
  .discard:hover {
    color: var(--warn);
    background: var(--panel);
  }
  .msg {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    padding: 5px 7px;
    margin-bottom: 8px;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .ghost {
    background: transparent;
  }
  .ghost.danger {
    color: var(--warn);
  }
  .ghost.danger:hover {
    background: var(--panel-2);
  }
</style>
