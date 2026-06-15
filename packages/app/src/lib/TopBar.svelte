<script lang="ts">
  import {
    collectionScaffold,
    composeMarkdown,
    dirOf,
    instantiateTemplate,
    slugify,
  } from '@grove/core'
  import { draftCount, setDraft } from './db/drafts.svelte'
  import { runSearch } from './db/search.svelte'
  import { type SyncStatus, commitAll, currentHead, syncState } from './db/sync.svelte'
  import { toBlob } from 'html-to-image'
  import { grove } from './grove/client'
  import Icon from './icons/Icon.svelte'
  import { spaceState, switchSpace } from './space.svelte'
  import { activeTab, openCollection, openRecord, showSearch } from './state.svelte'

  let { onhelp }: { onhelp?: () => void } = $props()

  let q = $state('')

  // Screenshot the app to a PNG download (html-to-image, the wash approach; local → no server save).
  let shot = $state('')
  let shotTimer = 0
  function flash(msg: string) {
    shot = msg
    if (shotTimer) clearTimeout(shotTimer)
    shotTimer = window.setTimeout(() => (shot = ''), 3000)
  }
  async function screenshot() {
    flash('capturing…')
    try {
      const blob = await toBlob(document.documentElement, {
        pixelRatio: window.devicePixelRatio || 1,
        cacheBust: false,
      })
      if (!blob) return flash('capture failed')
      const r = await fetch('/screenshot', { method: 'POST', body: blob })
      if (!r.ok) return flash(`save failed: ${r.status}`)
      flash(`saved ${(await r.text()).trim()}`)
    } catch (e) {
      flash(`error: ${(e as Error).message}`)
    }
  }

  const STATUS: Record<SyncStatus, string> = {
    idle: '',
    committing: 'Committing…',
    rebuilding: 'Rebuilding…',
    reloading: 'Reloading…',
    error: 'Error',
  }

  function onInput() {
    void runSearch(q)
    showSearch()
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

  function create(tpl: string) {
    const c = currentCollection()
    if (!c) return
    const title = window.prompt(`New ${c} document — title?`)
    if (!title) return
    const slug = `${c}/${slugify(title)}`
    if (grove.records.exists(slug)) {
      window.alert(`Already exists: ${slug}`)
      return
    }
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

  // New collection — nestable anywhere: under the current collection, or at the root.
  function createCollection() {
    const parent = currentCollection()
    const name = window.prompt(
      parent ? `New collection under ${parent} — name?` : 'New top-level collection — name?',
    )
    if (!name) return
    const slug = slugify(name)
    const dir = parent ? `${parent}/${slug}` : slug
    if (grove.meta.get(`${dir}/_grove/schema.yaml`) !== undefined) {
      window.alert(`Already exists: ${dir}`)
      return
    }
    const entry = window.confirm(
      'Structured records (fields + form)?\n\nOK = record collection · Cancel = document collection',
    )
      ? 'form'
      : 'editor'
    const files = collectionScaffold({ name: slug, entry })
    for (const [rel, content] of Object.entries(files)) {
      setDraft(`${dir}/${rel}`, content, currentHead())
    }
    openCollection(dir)
  }
</script>

<header class="topbar">
  <div class="brand">grove</div>
  {#if spaceState.spaces.length > 1}
    <select
      class="spacesel"
      value={spaceState.current}
      onchange={(e) => switchSpace(e.currentTarget.value)}
      title="Switch space">
      {#each spaceState.spaces as s (s)}<option value={s}>{s}</option>{/each}
    </select>
  {/if}
  <div class="searchbox">
    <Icon name="search" size={15} />
    <input type="search" placeholder="Search… (title + body)" bind:value={q} oninput={onInput} />
  </div>
  <span class="grow"></span>
  <div class="actions">
    {#if shot}<span class="shot">{shot}</span>{/if}
    <button class="iconbtn" title="Screenshot → PNG download" onclick={screenshot}>
      <Icon name="camera" size={15} />
    </button>
    <button class="iconbtn" title="Help — grove docs" onclick={() => onhelp?.()}>?</button>
    <details class="newmenu">
      <summary>+ New</summary>
      <div class="menu">
        <button onclick={() => create('')} disabled={!collection}>Blank document</button>
        {#each templates as t (t)}<button onclick={() => create(t)}>from {t}</button>{/each}
        <hr />
        <button onclick={createCollection}>Collection…</button>
      </div>
    </details>
    {#if syncState.status !== 'idle'}
      <span class="syncst" class:err={syncState.status === 'error'} title={syncState.message}>
        {STATUS[syncState.status]}
      </span>
    {/if}
    <button
      class="commit"
      disabled={draftCount() === 0 || syncState.status !== 'idle'}
      onclick={() => void commitAll()}>
      Commit ({draftCount()})
    </button>
  </div>
</header>

<style>
  .grow {
    flex: 1;
  }
  .newmenu {
    position: relative;
    display: inline-block;
  }
  .newmenu summary {
    list-style: none;
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
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
    border-radius: 6px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    z-index: 10;
  }
  .menu button {
    text-align: left;
    background: transparent;
    border: 0;
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--panel-2);
  }
  .menu hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 4px 2px;
  }
  .spacesel {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .iconbtn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .iconbtn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .shot {
    font-size: 12px;
    color: var(--muted);
    align-self: center;
  }
  .commit {
    background: var(--accent);
    color: #03110d;
    font-weight: 600;
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .commit:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .syncst {
    font-size: 12px;
    color: var(--muted);
    align-self: center;
  }
  .syncst.err {
    color: var(--warn);
  }
</style>
