import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE, onAppActive } from './lib/mobile.js'
import { useStore } from './store/useStore.js'
import './index.css'

// App.jsx restores per-route scroll itself; the browser's own attempt races it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

// Android app: bring the web code up to what the server publishes (lib/live-update.js). The
// running bundle confirms itself first — only after it has rendered — so a bundle that cannot
// start is never made permanent.
if (MOBILE) {
  setTimeout(() => {
    import('./lib/live-update.js').then(({ confirmLiveBundle, checkLiveUpdate }) => {
      if (!document.getElementById('root')?.childElementCount) return
      const canSwitch = () => !useStore.getState().S.active
      confirmLiveBundle().then(() => checkLiveUpdate({ force: true, canSwitch }))
      onAppActive(() => checkLiveUpdate({ canSwitch }))
    }).catch(() => {})
  }, 1500)
}
