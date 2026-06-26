<script lang="ts">
  // The "bin" section pinned at the top of the tree: a raw mirror of <space>/bin, distinct from the
  // semantic collections below it. Directories are labels; files open in the code editor on click;
  // executables (exec bit set) are tinted green. Refreshes on respin and via the manual button.
  import { syncState } from '../db/sync.svelte'
  import Icon from '../icons/Icon.svelte'
  import { activeTab, openFile } from '../state.svelte'
  import { binState, loadBin } from './bin.svelte'

  let open = $state(true)
  // Expanded subdirectories (paths like "bin/scripts"). Empty = only top-level entries show; a
  // directory's children appear only after it's clicked. Reassigned (not mutated) for reactivity.
  let expanded = $state<Set<string>>(new Set())

  // Initial load on mount; reload whenever a respin bumps builtAt (catches edits + terminal-created
  // scripts that triggered a rebuild). primed skips the first effect run so we don't double-fetch.
  let primed = false
  $effect(() => {
    void syncState.builtAt
    if (primed) void loadBin()
    primed = true
  })
  $effect(() => {
    if (!binState.loaded) void loadBin()
  })

  // Indent depth = path segments below "bin/": "bin/foo" → 0, "bin/a/b.sh" → 1.
  const indent = (p: string) => Math.max(0, p.split('/').length - 2)
  const isActiveFile = (p: string) => activeTab()?.kind === 'file' && activeTab()?.ref === p

  // An entry shows only when every ancestor directory under bin/ is expanded.
  function shown(path: string): boolean {
    const parts = path.split('/')
    for (let i = 2; i < parts.length; i++) {
      if (!expanded.has(parts.slice(0, i).join('/'))) return false
    }
    return true
  }
  function toggleDir(path: string) {
    const next = new Set(expanded)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    expanded = next
  }
</script>

<div class="bin">
  <button class="prow head" onclick={() => (open = !open)}>
    <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
    <Icon name="terminal" size={14} />
    <span class="label">bin</span>
    <span class="grow"></span>
    <Icon name="refresh-cw" size={12} />
  </button>
  {#if open}
    {#if binState.entries.length === 0}
      <p class="empty">{binState.loaded ? 'no files' : 'loading…'}</p>
    {:else}
      <ul>
        {#each binState.entries as e (e.path)}
          {#if shown(e.path)}
            <li>
              {#if e.dir}
                <button
                  class="prow dir"
                  data-dir={e.path}
                  style="padding-left: {8 + indent(e.path) * 14}px"
                  title={e.path}
                  onclick={() => toggleDir(e.path)}>
                  <Icon name={expanded.has(e.path) ? 'chevron-down' : 'chevron-right'} size={13} />
                  <Icon name={expanded.has(e.path) ? 'folder-open' : 'folder'} size={14} />
                  <span class="label">{e.name}</span>
                </button>
              {:else}
                <button
                  class="prow file"
                  class:exec={e.exec}
                  class:active={isActiveFile(e.path)}
                  data-file={e.path}
                  style="padding-left: {22 + indent(e.path) * 14}px"
                  title={e.path}
                  onclick={() => openFile(e.path)}>
                  <Icon name={e.exec ? 'file-cog' : 'file'} size={14} />
                  <span class="label">{e.name}</span>
                </button>
              {/if}
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .bin {
    border-bottom: 1px solid var(--border);
    padding-bottom: 4px;
    margin-bottom: 4px;
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
    font: inherit;
    font-size: 13px;
  }
  .prow.dir {
    color: var(--muted);
  }
  .prow.dir:hover {
    background: var(--panel-2);
  }
  .prow.file.exec {
    color: #3fb950; /* executable bit set */
  }
  .prow.file:hover,
  .prow.head:hover {
    background: var(--panel-2);
  }
  .prow.active {
    background: var(--panel-2);
  }
  .grow {
    flex: 1;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    padding: 4px 6px 4px 22px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
