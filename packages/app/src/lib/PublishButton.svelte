<script lang="ts">
  // Publish: push the commits the space's remote hasn't seen. Sits next to Commit because it's the
  // other half of the same cycle — Commit writes local git history, Publish shares it. The count is
  // how many commits are ahead of the remote; with no remote (or nothing ahead) the button is
  // disabled and says why, rather than disappearing and leaving the state unexplained.
  import { publishNow, publishState, refreshPublish } from './db/publish.svelte'
  import { syncState } from './db/sync.svelte'
  import Icon from './icons/Icon.svelte'
  import { currentSpace } from './space.svelte'

  // Re-read after every commit/respin (headCommit + builtAt both move) and on the first render of a
  // space; currentSpace() keeps a switch from showing the previous space's remote.
  $effect(() => {
    void syncState.headCommit
    void syncState.builtAt
    void currentSpace()
    void refreshPublish()
  })

  const st = $derived(publishState.status)
  const ahead = $derived(st?.ahead ?? 0)
  const enabled = $derived(Boolean(st?.publishable) && !publishState.busy)

  const title = $derived.by(() => {
    if (publishState.busy) return 'Publishing…'
    if (!st) return 'Publish — checking the space’s git remote…'
    if (!st.publishable) {
      return st.reason === 'nothing to publish'
        ? `Nothing to publish — ${st.remote ?? 'the remote'} already has every commit`
        : `Can’t publish — ${st.reason ?? 'unavailable'}`
    }
    const where = `${st.remote}${st.branch ? `/${st.branch}` : ''}`
    const extra = [
      st.behind ? `${st.behind} behind — pull first if the push is rejected` : '',
      st.uncommitted ? `${st.uncommitted} uncommitted change(s) won’t be included` : '',
      st.managed ? 'this space is part of a larger repo — its other commits go too' : '',
    ].filter(Boolean)
    return `Push ${ahead} commit(s) to ${where}${extra.length ? `\n${extra.join('\n')}` : ''}`
  })
</script>

<button
  class="btn publish"
  class:err={publishState.error}
  data-publish-state={publishState.busy
    ? 'busy'
    : st
      ? st.publishable
        ? 'ready'
        : (st.reason ?? 'blocked')
      : 'unknown'}
  disabled={!enabled}
  {title}
  onclick={() => void publishNow()}>
  <Icon name="cloud-upload" size={15} />
  {publishState.busy ? 'Publishing…' : ahead > 0 ? `Publish (${ahead})` : 'Publish'}
</button>

<style>
  .publish {
    white-space: nowrap;
  }
  .publish.err:disabled,
  .publish.err {
    border-color: var(--warn);
  }
</style>
