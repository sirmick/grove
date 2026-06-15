// Lets the top-bar Save act on whichever editor is open, and reflect its dirty state.
export const editorState = $state<{ dirty: boolean; save: (() => Promise<void>) | null }>({
  dirty: false,
  save: null,
})
