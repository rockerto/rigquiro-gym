import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'

export const BASE = process.env.E2E_BASE || 'http://localhost:8099'
const SERVICE_TOKEN = process.env.E2E_SERVICE_TOKEN || 'e2e-local-service-token'
export const SHOTS = process.env.E2E_SHOTS || new URL('../shots/', import.meta.url).pathname

// A single-use invite through the same service endpoint Rigbot uses, so the account is created
// by the real invite-only sign-up path.
export async function newInvite(request) {
  const r = await request.post(BASE + '/api/service/invites/new', {
    headers: { authorization: 'Bearer ' + SERVICE_TOKEN, 'content-type': 'application/json' },
    data: { ref: 'e2e' },
  })
  expect(r.ok(), 'invite: ' + r.status()).toBeTruthy()
  return (await r.json()).code
}

// Chromium's virtual WebAuthn authenticator (CDP): a platform passkey with user verification,
// so navigator.credentials.create/get resolve without a human, exactly as a phone's would.
export async function virtualPasskey(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  return { cdp, authenticatorId }
}

export async function register(page, name, invite) {
  // ?invite= opens the sign-up sheet by itself, code filled in — the link a patient receives.
  await page.goto('/?invite=' + invite)
  await expect(page.getByRole('heading', { name: 'Crea tu perfil' })).toBeVisible()
  await page.getByPlaceholder('Tu nombre').fill(name)
  await page.locator('input[type=checkbox]').first().check()
  await page.getByRole('button', { name: 'Crear passkey' }).click()
  await expect(page.getByRole('button', { name: 'Crear perfil nuevo' })).toHaveCount(0, { timeout: 20_000 })
  return page.evaluate(() => fetch('/api/me', { credentials: 'include' }).then(r => r.json()))
}

export async function signIn(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Iniciar sesión con passkey' }).click()
  await expect(page.getByRole('button', { name: 'Iniciar sesión con passkey' })).toHaveCount(0, { timeout: 20_000 })
}

// Put a copy of a profile document into the signed-in account through the API (a conditional
// write on the current revision, as the app itself does), then drop this browser's local copy so
// the next load adopts the server's.
export async function importState(page, state) {
  const res = await page.evaluate(async st => {
    const { rev } = await fetch('/api/data/rev').then(r => r.json())
    const r = await fetch('/api/data', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: st, baseRev: rev }) })
    return { status: r.status, body: await r.json() }
  }, state)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  await page.evaluate(() => { localStorage.removeItem('gym_state_v1'); localStorage.removeItem('gym_sync'); localStorage.removeItem('gym_dirty') })
}

export const robertoState = () => {
  const p = process.env.ROBERTO_STATE
  if (!p) throw new Error('ROBERTO_STATE: path to the local copy of the profile document')
  const st = JSON.parse(readFileSync(p, 'utf8'))
  delete st._rev
  // Against production only the plan travels: no logged workouts, no body weight.
  if (process.env.E2E_PLAN_ONLY) Object.assign(st, { workouts: [], bodyweight: [], exWeights: {}, exNotes: {}, gymCards: [] })
  return st
}

// Every work/warm-up row of the exercise card on screen, as [weight, reps] numbers.
export async function visibleRows(page) {
  return page.locator('.setrow').evaluateAll(rows => rows.map(r => {
    const vals = [...r.querySelectorAll('input')].map(i => i.value)
    const txt = vals.length ? vals : [...r.querySelectorAll('.val, .num, span, div')].map(e => e.textContent.trim()).filter(Boolean)
    return txt.map(v => Number(String(v).replace(',', '.'))).filter(n => Number.isFinite(n))
  }))
}

// Today's session from Home, the way Roberto starts it: the "Hoy" row, then past the weigh-in.
export async function startToday(page) {
  await page.locator('.today-row').click()
  const skip = page.getByRole('button', { name: 'Empezar sin pesarse' })
  await Promise.race([skip.waitFor({ timeout: 4000 }).catch(() => {}), page.waitForURL(/\/workout/, { timeout: 4000 }).catch(() => {})])
  if (await skip.count()) await skip.click()
  await page.waitForURL(/\/workout/)
  await expect(page.locator('.setrow').first()).toBeVisible()
}

// The exercise(s) on screen — one, or the members of a superset — each with the rows it opens
// with as [weight, reps]. Names are the big title above each block.
export async function exercisesOnScreen(page) {
  return page.locator('[data-testid=workout-swipe-surface]').evaluate(surface => {
    const out = []
    const big = el => { const cs = getComputedStyle(el); return parseFloat(cs.fontSize) >= 17 && Number(cs.fontWeight) >= 600 && el.children.length === 0 && el.textContent.trim().length > 3 }
    let titles = [...document.querySelectorAll('div, h1, h2, h3')].filter(big)
    for (const row of surface.querySelectorAll('.setrow')) {
      const title = titles.filter(t => t.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).pop()
      const name = title ? title.textContent.trim() : '?'
      let ex = out.find(e => e.name === name)
      if (!ex) out.push(ex = { name, rows: [] })
      ex.rows.push([...row.querySelectorAll('input')].map(i => Number(i.value.replace(',', '.'))))
    }
    return out
  })
}

// Walk the whole session card by card ("Siguiente"), screenshotting each one.
export async function walkSession(page, shotPrefix) {
  const all = []
  // A resumed session reopens on the card it was left at: start from the first one.
  await expect(page.locator('.setrow').first()).toBeVisible()
  const prev = page.getByRole('button', { name: 'Anterior', exact: true }).first()
  for (let i = 0; i < 20 && (await prev.count()) && !(await prev.isDisabled()); i++) { await prev.click(); await page.waitForTimeout(150) }
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250)
    if (shotPrefix) await page.screenshot({ path: `${SHOTS}${shotPrefix}-${String(i + 1).padStart(2, '0')}.png`, fullPage: true })
    all.push(...await exercisesOnScreen(page))
    const next = page.getByRole('button', { name: 'Siguiente', exact: true }).first()
    if (!(await next.count()) || await next.isDisabled()) break
    await next.click()
  }
  return all
}

export async function discardSession(page) {
  await page.getByRole('button', { name: 'Descartar' }).first().click()
  await page.getByRole('button', { name: 'Descartar' }).last().click()
  await page.waitForURL(/\/home/)
}

export const atDay = async (page, iso) => {
  await page.clock.setFixedTime(new Date(iso + 'T18:30:00-03:00'))
  await page.goto('/')
  await expect(page.locator('.today-row')).toBeVisible()
}

// "12@20, 9@30 …" — the plan's own notation, so a failure reads like the training sheet.
export const fmtRows = rows => rows.map(([w, r]) => `${r}@${w}`)
