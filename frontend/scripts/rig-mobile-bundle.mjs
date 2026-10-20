#!/usr/bin/env node
// Builds the Android app's web code and lays it out for the phone's live update
// (src/lib/live-update.js):
//
//   node scripts/rig-mobile-bundle.mjs            → dist/ (mobile build) + live/<id>/ + live/latest.json
//   node scripts/rig-mobile-bundle.mjs --sync     → the same, then `cap sync android` (for an APK)
//
// <id> = <native version>-<git sha>-<UTC stamp>, compiled into the bundle as VITE_BUNDLE_ID, so
// the phone can tell which code it runs. Publishing is copying live/ to /var/www/rigquiro-app/web/
// on the server, files first and latest.json last (see docs/RIGQUIRO_DEPLOY.md).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const FE = fileURLToPath(new URL('..', import.meta.url))
const gradle = readFileSync(join(FE, 'android/app/build.gradle'), 'utf8')
const native = (gradle.match(/versionName "([^"]+)"/) || [])[1]
if (!native) throw new Error('versionName not found in android/app/build.gradle')
// The oldest shell that can run this bundle: the first one with live update and @capacitor/app.
const MIN_NATIVE = '1.0.2'
const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: FE }).toString().trim()
const dirty = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: FE }).toString().trim() ? '-wip' : ''
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
const id = `${native}-${sha}${dirty}-${stamp}`

const CDN = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/'
execFileSync('npx', ['vite', 'build'], {
  cwd: FE, stdio: 'inherit',
  env: { ...process.env, VITE_MOBILE: '1', VITE_IMG_BASE: CDN + 'images/', VITE_GIF_BASE: CDN + 'videos/', VITE_BUNDLE_ID: id },
})

const dist = join(FE, 'dist')
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = walk(dist).map(p => ({ p: relative(dist, p).split('\\').join('/'), h: createHash('sha256').update(readFileSync(p)).digest('hex') }))
  .sort((a, b) => a.p.localeCompare(b.p))

const out = join(FE, 'live')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, id), { recursive: true })
cpSync(dist, join(out, id), { recursive: true })
writeFileSync(join(out, 'latest.json'), JSON.stringify({ id, minNative: MIN_NATIVE, files }) + '\n')
console.log(`bundle ${id}: ${files.length} files → live/${id}/ + live/latest.json`)

if (process.argv.includes('--sync')) execFileSync('npx', ['cap', 'sync', 'android'], { cwd: FE, stdio: 'inherit' })
