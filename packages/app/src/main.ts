import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { startSession } from './lib/session.svelte'
import { bootSpace } from './lib/space.svelte'
import { applyTheme } from './lib/theme.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app not found')

applyTheme() // reflect the persisted/OS theme onto <html> before first paint
const app = mount(App, { target })

void (async () => {
  await bootSpace() // settle THIS tab's space (URL first) before anything scoped to it loads
  await startSession()
})()

export default app
