<script lang="ts">
  import { type SchemaHint, composeMarkdown, extractFields, proseOf, titleOf } from '@grove/core'
  import { untrack } from 'svelte'
  import Wysiwyg from './Wysiwyg.svelte'

  // Structured form view: typed field widgets + a WYSIWYG body. Parses the markdown body it's
  // given and emits a recomposed body (without frontmatter — the parent owns frontmatter).
  let {
    body,
    schema,
    slug,
    links = [],
    onchange,
  }: {
    body: string
    schema: SchemaHint
    slug: string
    links?: string[]
    onchange?: (body: string) => void
  } = $props()

  const fieldNames = untrack(() => Object.keys(schema.fields))
  const fallback = untrack(() => slug.split('/').pop() ?? slug)

  // Snapshot the incoming body once; edits flow out via onchange (parent is the source of truth).
  let title = $state(untrack(() => titleOf(body, fallback)))
  let prose = $state(untrack(() => proseOf(body)))
  const values = $state<Record<string, string>>(
    untrack(() => {
      const f = extractFields(body, schema).fields
      return Object.fromEntries(
        fieldNames.map((k) => {
          const v = f[k]
          return [k, v === undefined || v === null ? '' : String(v)]
        }),
      )
    }),
  )

  function emit() {
    onchange?.(
      composeMarkdown({
        title,
        fields: fieldNames.map((k) => [k, values[k]] as [string, unknown]),
        body: prose,
      }),
    )
  }
</script>

<div class="form">
  <label class="titlerow">
    <span class="muted">title</span>
    <input class="titleinput" bind:value={title} oninput={emit} />
  </label>

  {#if fieldNames.length}
    <div class="fields">
      {#each fieldNames as name (name)}
        {@const hint = schema.fields[name]}
        <label class="field">
          <span class="muted">{name}{hint?.default !== undefined ? ` (default ${hint.default})` : ''}</span>
          {#if hint?.type === 'enum'}
            <select bind:value={values[name]} onchange={emit}>
              <option value="">—</option>
              {#each hint.values ?? [] as opt}<option value={opt}>{opt}</option>{/each}
            </select>
          {:else if hint?.type === 'integer' || hint?.type === 'number'}
            <input type="number" bind:value={values[name]} oninput={emit} />
          {:else if hint?.type === 'date'}
            <input type="date" bind:value={values[name]} oninput={emit} />
          {:else if hint?.type === 'boolean'}
            <input
              type="checkbox"
              checked={values[name] === 'true'}
              onchange={(e) => {
                values[name] = e.currentTarget.checked.toString()
                emit()
              }} />
          {:else}
            <input type="text" bind:value={values[name]} oninput={emit} />
          {/if}
        </label>
      {/each}
    </div>
  {/if}

  <span class="muted bodylabel">body</span>
  <Wysiwyg
    content={prose}
    {links}
    sourceSlug={slug}
    onchange={(md) => {
      prose = md
      emit()
    }} />
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .titlerow {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .titleinput {
    font-size: 20px;
    font-weight: 600;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 6px 10px;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
  }
  .field input,
  .field select {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 5px 8px;
  }
  .bodylabel {
    font-size: 12px;
  }
</style>
