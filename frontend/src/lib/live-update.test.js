import { describe, it, expect } from 'vitest'
import { liveDecision, compareVersions } from './live-update.js'

// The decision the phone takes on what the server published. Getting it wrong either leaves
// the phone on old code (the 20-oct pyramid bug) or loads code the installed shell cannot run.
const H = 'a'.repeat(64)
const manifest = (over = {}) => ({ id: '1.0.2-abc1234', minNative: '1.0.2', files: [{ p: 'index.html', h: H }, { p: 'assets/index-X.js', h: H }], ...over })
const ctx = (over = {}) => ({ bundleId: '1.0.2-old0000', nativeVersion: '1.0.2', tried: null, ...over })

describe('liveDecision', () => {
  it('switches to newer web code the installed shell can run', () => {
    expect(liveDecision(manifest(), ctx())).toBe('apply')
  })
  it('does nothing when the phone already runs it', () => {
    expect(liveDecision(manifest(), ctx({ bundleId: '1.0.2-abc1234' }))).toBe('current')
  })
  it('leaves code that needs a newer APK to the APK update', () => {
    expect(liveDecision(manifest({ minNative: '1.0.3' }), ctx())).toBe('needs-apk')
    expect(liveDecision(manifest({ minNative: '1.0.2' }), ctx({ nativeVersion: '1.0.10' }))).toBe('apply')
  })
  it('does not retry a bundle that was switched to and never confirmed it booted', () => {
    expect(liveDecision(manifest(), ctx({ tried: { id: '1.0.2-abc1234' } }))).toBe('tried')
    expect(liveDecision(manifest({ id: '1.0.2-def5678' }), ctx({ tried: { id: '1.0.2-abc1234' } }))).toBe('apply')
  })
  it('refuses a manifest it cannot trust to lay files out safely', () => {
    expect(liveDecision(null, ctx())).toBe('invalid')
    expect(liveDecision(manifest({ id: '../x' }), ctx())).toBe('invalid')
    expect(liveDecision(manifest({ files: [{ p: 'assets/a.js', h: H }] }), ctx())).toBe('invalid')
    expect(liveDecision(manifest({ files: [{ p: 'index.html', h: H }, { p: '../../shared_prefs/x', h: H }] }), ctx())).toBe('invalid')
    expect(liveDecision(manifest({ files: [{ p: 'index.html', h: 'nothex' }] }), ctx())).toBe('invalid')
  })
})

describe('compareVersions', () => {
  it('orders dotted versions numerically', () => {
    expect(compareVersions('1.0.10', '1.0.2')).toBe(1)
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1)
    expect(compareVersions('v1.0.2', '1.0.2')).toBe(0)
  })
})
