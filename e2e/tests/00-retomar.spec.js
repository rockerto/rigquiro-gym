import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { newInvite, virtualPasskey, register, importState, robertoState, startToday, walkSession, atDay, fmtRows, SHOTS } from './helpers.js'

// What happened on Roberto's phone on 20-oct, replayed against the local copy: the session is
// started by code from BEFORE per-set targets (E2E_OLD_WEB_IMAGE), the web container is then
// swapped for the code under test (E2E_WEB_IMAGE) and the same browser — same saved state —
// opens the app again and resumes. Local stack only: it restarts a container.
const { DAYS = [] } = process.env.E2E_PLAN ? await import(process.env.E2E_PLAN) : {}
const OLD = process.env.E2E_OLD_WEB_IMAGE
const NEW = process.env.E2E_WEB_IMAGE
const swapWeb = image => execFileSync('docker', ['compose', 'up', '-d', '--no-deps', 'web'], {
  cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, E2E_WEB_IMAGE: image }, stdio: 'ignore',
})

test.skip(!OLD || !NEW || !DAYS.length || /^https:/.test(process.env.E2E_BASE || ''), 'local stack with both images, and E2E_PLAN')

test('una sesión empezada con código viejo se retoma con la pirámide', async ({ page, request }) => {
  const tue = DAYS[0]
  swapWeb(OLD)
  await page.waitForTimeout(1500)
  await virtualPasskey(page)
  await register(page, 'E2E Retomar', await newInvite(request))
  await importState(page, robertoState())
  await atDay(page, tue.iso)
  await startToday(page)
  // He logs the first set of the press (20 × 12 is right for set 1), then looks through the rest.
  await page.locator('.setrow').first().locator('.chk').click()
  await expect(page.locator('.setrow').first().locator('.chk')).toHaveAttribute('aria-checked', 'true')
  const before = await walkSession(page, 'retomar-1-codigo-viejo')
  console.log('VIEJO', JSON.stringify(before.map(e => fmtRows(e.rows).join(' '))))
  // The old build lays the first pyramid out flat, every row at row 1's numbers — the
  // screenshot Roberto sent at 19:38.
  expect(fmtRows(before[0].rows)).toEqual(Array(tue.want[0].length).fill(fmtRows(tue.want[0])[0]))
  await page.goto('/')

  swapWeb(NEW)
  await page.waitForTimeout(1500)
  await atDay(page, tue.iso)
  await expect(page.locator('.today-row')).toContainText(/en curso/i)
  await page.screenshot({ path: `${SHOTS}retomar-2-inicio-en-curso.png` })
  await page.locator('.today-row').click()
  await page.waitForURL(/\/workout/)
  const after = await walkSession(page, 'retomar-3-codigo-nuevo')
  console.log('NUEVO', JSON.stringify(after.map(e => fmtRows(e.rows).join(' '))))
  expect(after.map(e => fmtRows(e.rows))).toEqual(tue.want.map(fmtRows))
  // The set he logged is still logged; the ones he had not done yet are the plan's.
  const prev = page.getByRole('button', { name: 'Anterior', exact: true }).first()
  while (!(await prev.isDisabled())) await prev.click()
  const checks = page.locator('.setrow .chk')
  await expect(checks.nth(0)).toHaveAttribute('aria-checked', 'true')
  await expect(checks.nth(1)).toHaveAttribute('aria-checked', 'false')
  await page.screenshot({ path: `${SHOTS}retomar-4-serie1-hecha-resto-piramide.png`, fullPage: true })
})
