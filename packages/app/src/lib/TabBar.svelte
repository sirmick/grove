<script lang="ts">
  // The content column's header: open tabs on the left, content actions pinned right (the editor
  // mode chip + Edit/Done only on a doc; Save + New always). Co-located with the tabs they affect.
  import {
    collectionScaffold,
    composeMarkdown,
    dirOf,
    instantiateTemplate,
    slugify,
  } from '@grove/core'
  import { draftCount, hasDraft, setDraft } from './db/drafts.svelte'
  import { type SyncStatus, commitAll, currentHead, syncState } from './db/sync.svelte'
  import { grove } from './grove/client'
  import Icon from './icons/Icon.svelte'
  import { activeTab, closeTab, openCollection, openRecord, setActive, tabsState } from './state.svelte'
  import { editor } from './ui.svelte'

  const STATUS: Record<SyncStatus, string> = {
    idle: '',
    committing: 'Committing…',
    rebuilding: 'Rebuilding…',
    reloading: 'Reloading…',
    error: 'Error',
  }

  function currentCollection(): string | null {
    const t = activeTab()
    if (!t) return null
    if (t.kind === 'collection') return t.ref
    if (t.kind === 'doc') return dirOf(t.ref)
    return null
  }

  const collection = $derived(currentCollection())
  const templates = $derived(collection ? grove.collections.get(collection).manifest.templates : [])
  const activeDoc = $derived(activeTab()?.kind === 'doc' ? (activeTab()?.ref ?? null) : null)

  function startEdit() {
    if (!activeDoc) return
    editor.mode = grove.schema.get(dirOf(activeDoc)).entry === 'form' ? 'form' : 'document'
    editor.editing = true
  }

  function create(tpl: string) {
    const c = currentCollection()
    if (!c) return
    const title = window.prompt(`New ${c} document — title?`)
    if (!title) return
    const slug = `${c}/${slugify(title)}`
    if (grove.records.exists(slug)) return window.alert(`Already exists: ${slug}`)
    let md: string
    if (tpl) {
      const inst = instantiateTemplate(grove.meta.get(`${c}/_grove/templates/${tpl}`) ?? '', title)
      md = inst.trimStart().startsWith('#')
        ? `${inst.trimEnd()}\n`
        : composeMarkdown({ title, fields: [], body: inst })
    } else {
      md = composeMarkdown({ title, fields: [], body: '' })
    }
    setDraft(`${slug}.md`, md, currentHead())
    openRecord(slug)
  }

  function createCollection() {
    const parent = currentCollection()
    const name = window.prompt(
      parent ? `New collection under ${parent} — name?` : 'New top-level collection — name?',
    )
    if (!name) return
    const slug = slugify(name)
    const dir = parent ? `${parent}/${slug}` : slug
    if (grove.meta.get(`${dir}/_grove/schema.yaml`) !== undefined) {
      return window.alert(`Already exists: ${dir}`)
    }
    const entry = window.confirm(
      'Structured records (fields + form)?\n\nOK = record collection · Cancel = document collection',
    )
      ? 'form'
      : 'editor'
    for (const [rel, content] of Object.entries(collectionScaffold({ name: slug, entry }))) {
      setDraft(`${dir}/${rel}`, content, currentHead())
    }
    openCollection(dir)
  }
</script>

<div class="tabbar">
  <div class="tabs">
    {#each tabsState.tabs as t (t.id)}
      <div class="tab" class:active={t.id === tabsState.activeId}>
        <button class="tablabel" onclick={() => setActive(t.id)}>
          {t.title}{t.kind === 'doc' && hasDraft(`${t.ref}.md`) ? ' •' : ''}
        </button>
        <button class="tabclose" title="Close" onclick={() => closeTab(t.id)}>×</button>
      </div>
    {/each}
  </div>

  <div class="acts">
    {#if activeDoc}
      {#if editor.editing}
        <div class="seg">
          <button class:on={editor.mode === 'document'} onclick={() => (editor.mode = 'document')}>Document</button>
          <button class:on={editor.mode === 'form'} onclick={() => (editor.mode = 'form')}>Form</button>
          <button class:on={editor.mode === 'source'} onclick={() => (editor.mode = 'source')}>Source</button>
        </div>
        <button class="btn" onclick={() => (editor.editing = false)}>
          <Icon name="check" size={15} /> Done
        </button>
      {:else}
        <button class="btn" onclick={startEdit}><Icon name="pencil" size={15} /> Edit</button>
      {/if}
    {/if}

    {#if syncState.status !== 'idle'}
      <span class="syncst" class:err={syncState.status === 'error'} title={syncState.message}>
        {STATUS[syncState.status]}
      </span>
    {/if}

    <details class="newmenu">
      <summary class="btn"><Icon name="plus" size={15} /> New</summary>
      <div class="menu">
        <button onclick={() => create('')} disabled={!collection}>
          <Icon name="file-text" size={14} /> Blank document
        </button>
        {#each templates as t (t)}
          <button onclick={() => create(t)}><Icon name="file-text" size={14} /> from {t}</button>
        {/each}
        <hr />
        <button onclick={createCollection}><Icon name="folder" size={14} /> Collection…</button>
      </div>
    </details>

    <button
      class="btn primary"
      disabled={draftCount() === 0 || syncState.status !== 'idle'}
      onclick={() => void commitAll()}>
      <Icon name="save" size={15} /> Save ({draftCount()})
    </button>
  </div>
</div>

<style>
  .tabbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .tabs {
    display: flex;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
  }
  .tab {
    display: flex;
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .tab.active {
    background: var(--panel-2);
    border-color: var(--accent);
  }
  .tablabel {
    background: none;
    border: 0;
    color: var(--text);
    padding: 3px 8px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
  }
  .tabclose {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 3px 6px;
  }
  .tabclose:hover {
    color: var(--warn);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .syncst {
    font-size: 12px;
    color: var(--muted);
  }
  .syncst.err {
    color: var(--warn);
  }
  .newmenu {
    position: relative;
  }
  .newmenu summary {
    list-style: none;
  }
  .newmenu summary::-webkit-details-marker {
    display: none;
  }
  .menu {
    position: absolute;
    right: 0;
    margin-top: 4px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    z-index: 10;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    background: transparent;
    border: 0;
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }
  .menu button:hover:not(:disabled) {
    background: var(--panel-2);
  }
  .menu button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .menu hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 4px 2px;
  }
</style>
