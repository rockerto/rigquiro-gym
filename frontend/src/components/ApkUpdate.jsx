// Installing a newer Android shell (APK) from gym.rigdigital.cl/app. Web-code changes reach the
// phone without this (lib/live-update.js); a new APK is only needed when the native shell itself
// changes, and then the phone says so on the home screen instead of waiting for someone to look
// in Settings — the 1.0.0 shell only ever checked there, which is how a fixed build sat unused.
import { useEffect, useState, forwardRef } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE, isAndroid } from '../lib/mobile.js'
import { checkForUpdate, downloadAndInstall } from '../lib/update.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'

// Download progress sheet — receives a ref callback that exposes a (received, total) setter,
// so byte counts go in without re-rendering whatever opened it.
const DownloadProgress = forwardRef(function DownloadProgress(_, ref) {
  const [pct, setPct] = useState(0)
  const [text, setText] = useState(t('Starting download…'))
  if (ref) ref(function update(received, total) {
    if (total > 0) {
      const p = Math.min(100, Math.round((received / total) * 100))
      setPct(p)
      setText(t('{0} %', p))
    } else {
      setText(t('{0} MB', (received / 1_000_000).toFixed(1)))
    }
  })
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <h3>{t('Downloading update…')}</h3>
      <div style={{ margin: '16px 0', height: 6, borderRadius: 3, background: 'var(--fill-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: 'var(--acc)', borderRadius: 3, transition: 'width .2s' }} />
      </div>
      <div className="muted small">{text}</div>
    </div>
  )
})

export function startApkUpdate(updateInfo) {
  if (!updateInfo?.hasUpdate) return
  if (!updateInfo.apkUrl) { window.open('https://gym.rigdigital.cl/app/', '_blank', 'noopener'); return }
  confirmSheet({
    title: t('Update to {0}?', updateInfo.latestVersion),
    message: t('The latest version will be downloaded and the installer will open.'),
    confirmText: t('Download & Install'),
    onConfirm: async () => {
      let closeProgress = null
      let setProgress = null
      useUI.getState().openSheet(close => {
        closeProgress = close
        return <DownloadProgress ref={fn => { setProgress = fn }} />
      }, { locked: true })
      try {
        // The checksum is published next to the APK. Without it the file is not installed — a
        // sideloaded binary is exactly the thing that should be verified.
        let expectedHash = null
        if (updateInfo.hashUrl) {
          try {
            const hashRes = await fetch(updateInfo.hashUrl)
            if (hashRes.ok) expectedHash = (await hashRes.text()).split(/\s/)[0]
          } catch (e) { /* reported below */ }
        }
        if (!/^[0-9a-f]{64}$/i.test(expectedHash || '')) throw new Error(t('Checksum not available — not installing'))
        await downloadAndInstall(updateInfo.apkUrl, expectedHash, (received, total) => {
          if (setProgress) setProgress(received, total)
        })
        if (closeProgress) closeProgress()
      } catch (e) {
        if (closeProgress) closeProgress()
        useUI.getState().toast(t('Update failed: {0}', e.message))
      }
    },
  })
}

/** Home-screen card shown only on the Android app when a newer APK is published. */
export function ApkUpdateBanner() {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    if (!MOBILE) return
    let gone = false
    isAndroid().then(ok => { if (ok) checkForUpdate().then(i => { if (!gone) setInfo(i) }).catch(() => {}) })
    return () => { gone = true }
  }, [])
  if (!info?.hasUpdate) return null
  return <button className="card" onClick={() => startApkUpdate(info)}
    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--acc)', color: 'var(--label)' }}>
    <span style={{ color: 'var(--acc)', display: 'flex' }}><Icon name="download" size={22} /></span>
    <span style={{ flex: 1 }}>
      <span style={{ display: 'block', fontWeight: 600 }}>{t('Update to Rigquiro v{0}', info.latestVersion)}</span>
      <span className="small muted">{t('The latest version will be downloaded and the installer will open.')}</span>
    </span>
    <Icon name="chevronRight" size={18} />
  </button>
}
