// Android app: the web code ships inside the APK, so a server deploy never reached the phone —
// 20-oct-2026 the server had per-set targets for hours while the phone kept laying pyramids out
// flat. This brings the phone's web code up to what the server publishes, at app open and on
// every return to the foreground, with no install step:
//
//   gym.rigdigital.cl/app/web/latest.json  { id, minNative, files: [{ p, h }] }   (sha-256 per file)
//
// The files land in the app's private storage (live/<id>/) and Capacitor's WebView is pointed at
// that folder (setServerBasePath — same https://localhost origin, so localStorage and the paired
// session carry over). The switch is only made permanent (persistServerBasePath) by the new code
// itself once it has booted: a bundle that cannot start is never persisted, the next cold start
// comes back on the previous one, and `live/tried.json` keeps it from being retried. Installing a
// newer APK resets all of this (Capacitor drops the persisted path on a new binary), and a bundle
// that needs a newer APK than the one installed is left to the APK update banner instead.
import { MOBILE } from './mobile.js'

export const BUNDLE_ID = import.meta.env.VITE_BUNDLE_ID || 'dev'
export const LIVE_LATEST_URL = 'https://gym.rigdigital.cl/app/web/latest.json'
const ROOT = 'live'
const TRIED = ROOT + '/tried.json'
const MIN_GAP_MS = 5 * 60000

export function compareVersions(a, b) {
  const pa = String(a || '0').replace(/^v/, '').split('.').map(Number)
  const pb = String(b || '0').replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

/**
 * What to do with a published manifest: 'current' (already running it), 'needs-apk' (it needs
 * a newer native shell than the installed one), 'tried' (it was switched to once and never
 * confirmed it booted — a broken bundle is not retried), 'invalid' or 'apply'.
 */
export function liveDecision(manifest, { bundleId, nativeVersion, tried }) {
  if (!manifest || typeof manifest.id !== 'string' || !/^\w[\w.-]{0,79}$/.test(manifest.id)) return 'invalid'
  const files = manifest.files
  if (!Array.isArray(files) || !files.some(f => f && f.p === 'index.html')) return 'invalid'
  if (!files.every(f => f && typeof f.p === 'string' && /^\w[\w./-]*$/.test(f.p) && !f.p.includes('..') && /^[0-9a-f]{64}$/.test(f.h))) return 'invalid'
  if (manifest.id === bundleId) return 'current'
  if (manifest.minNative && compareVersions(nativeVersion, manifest.minNative) < 0) return 'needs-apk'
  if (tried && tried.id === manifest.id) return 'tried'
  return 'apply'
}

async function sha256Hex(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function plugins() {
  const [{ Filesystem, Directory, Encoding }, { App }, core] = await Promise.all([
    import('@capacitor/filesystem'), import('@capacitor/app'), import('@capacitor/core')])
  if (core.Capacitor.getPlatform() !== 'android') return null
  return { Filesystem, Directory, Encoding, App, WebView: core.registerPlugin('WebView') }
}

async function readJson(P, path) {
  try { return JSON.parse((await P.Filesystem.readFile({ path, directory: P.Directory.Data, encoding: P.Encoding.UTF8 })).data) }
  catch { return null }
}

/**
 * Called once the app has rendered. When this code is a bundle that was just switched to, make
 * the switch permanent and clear the trial marker; then drop bundles nothing points at anymore.
 */
export async function confirmLiveBundle() {
  if (!MOBILE) return
  try {
    const P = await plugins()
    if (!P) return
    const tried = await readJson(P, TRIED)
    const { path } = await P.WebView.getServerBasePath()
    if (tried && tried.id === BUNDLE_ID && String(path || '').includes('/' + ROOT + '/' + BUNDLE_ID)) {
      await P.WebView.persistServerBasePath()
      await P.Filesystem.deleteFile({ path: TRIED, directory: P.Directory.Data }).catch(() => {})
    }
    const keep = String(path || '').includes('/' + ROOT + '/') ? String(path).split('/' + ROOT + '/')[1].split('/')[0] : null
    const dirs = await P.Filesystem.readdir({ path: ROOT, directory: P.Directory.Data }).catch(() => ({ files: [] }))
    for (const f of dirs.files || []) {
      const name = typeof f === 'string' ? f : f.name
      if (f.type === 'file' || name === keep || name.endsWith('.json')) continue
      await P.Filesystem.rmdir({ path: ROOT + '/' + name, directory: P.Directory.Data, recursive: true }).catch(() => {})
    }
  } catch { /* nothing to confirm on this platform */ }
}

let lastCheck = 0
let running = null
/**
 * Fetch the published manifest and, when it is newer web code this shell can run, download it
 * (reusing every file the running bundle already has with the same hash) and switch to it —
 * the WebView reloads into the new code right away, unless `canSwitch()` says not now.
 */
export function checkLiveUpdate({ force = false, canSwitch = () => true } = {}) {
  if (!MOBILE) return Promise.resolve('off')
  if (running) return running
  if (!force && Date.now() - lastCheck < MIN_GAP_MS) return Promise.resolve('throttled')
  lastCheck = Date.now()
  running = (async () => {
    const P = await plugins()
    if (!P) return 'off'
    const res = await fetch(LIVE_LATEST_URL, { cache: 'no-cache' })
    if (!res.ok) return 'unavailable'
    const manifest = await res.json()
    const { version: nativeVersion } = await P.App.getInfo()
    const decision = liveDecision(manifest, { bundleId: BUNDLE_ID, nativeVersion, tried: await readJson(P, TRIED) })
    if (decision !== 'apply') return decision
    // Switching reloads the app: never in the middle of a workout (rest timer, open sheets).
    // The next open or return to the app after the session ends picks it up.
    if (!canSwitch()) return 'deferred'
    const base = new URL('./' + manifest.id + '/', LIVE_LATEST_URL).href
    const dir = ROOT + '/' + manifest.id
    for (const f of manifest.files) {
      // Most files of a new build are byte-identical to the running one (hashed chunk names):
      // those come from the app itself, only the changed ones over the network.
      let buf = null
      try { const own = await fetch('/' + f.p); if (own.ok) { const b = await own.arrayBuffer(); if (await sha256Hex(b) === f.h) buf = b } } catch { /* not in this bundle */ }
      if (!buf) {
        const r = await fetch(base + f.p, { cache: 'no-cache' })
        if (!r.ok) throw new Error('live update: ' + f.p + ' ' + r.status)
        buf = await r.arrayBuffer()
        if (await sha256Hex(buf) !== f.h) throw new Error('live update: checksum ' + f.p)
      }
      await P.Filesystem.writeFile({ path: dir + '/' + f.p, directory: P.Directory.Data, data: toBase64(buf), recursive: true })
    }
    await P.Filesystem.writeFile({ path: TRIED, directory: P.Directory.Data, data: JSON.stringify({ id: manifest.id, at: Date.now() }), encoding: P.Encoding.UTF8, recursive: true })
    const { uri } = await P.Filesystem.getUri({ path: dir, directory: P.Directory.Data })
    await P.WebView.setServerBasePath({ path: decodeURI(uri.replace(/^file:\/\//, '')) })
    return 'applied'
  })().catch(() => 'error').finally(() => { running = null })
  return running
}
