import { test, expect } from '@playwright/test'
import { newInvite, virtualPasskey, register, importState, robertoState, startToday, walkSession, discardSession, atDay, fmtRows, SHOTS } from './helpers.js'

// The yardstick is the training sheet itself, as data (E2E_PLAN: a module exporting DAYS,
// PLAN_VIEW, CHANGE_DAY, OTHER_WORKOUT), kept with the athlete's files, never in this public repo.
const { DAYS = [], PLAN_VIEW, CHANGE_DAY, OTHER_WORKOUT } = process.env.E2E_PLAN ? await import(process.env.E2E_PLAN) : {}
test.skip(!process.env.E2E_PLAN || !process.env.ROBERTO_STATE, 'needs E2E_PLAN and ROBERTO_STATE (private, outside the repo)')

// One throwaway account holding a copy of Roberto's plan, walked day by day exactly the way he
// starts a session: Home → "Hoy" → past the weigh-in → the workout screen. Every row of every
// exercise is compared with the training sheet.
test.describe.serial('la semana de Roberto en la app real', () => {
  let page
  test.beforeAll(async ({ browser, request }) => {
    page = await browser.newPage()
    await virtualPasskey(page)
    const me = await register(page, process.env.E2E_ACCOUNT_NAME || 'E2E Piramides', await newInvite(request))
    test.info().annotations.push({ type: 'cuenta', description: me.user.id })
    console.log('E2E_ACCOUNT', me.user.id)
    await importState(page, robertoState())
  })
  test.afterAll(async () => { await page?.close() })

  for (const day of DAYS) {
    test(day.label, async () => {
      await atDay(page, day.iso)
      if (day.rest) {
        await expect(page.locator('.today-row')).toContainText(/descanso/i)
        await page.screenshot({ path: `${SHOTS}${day.iso}-descanso.png` })
        return
      }
      await startToday(page)
      const got = await walkSession(page, day.iso)
      console.log(day.label, JSON.stringify(got.map(e => [e.name, fmtRows(e.rows).join(' ')])))
      expect(got.map(e => fmtRows(e.rows))).toEqual(day.want.map(fmtRows))
      await discardSession(page)
    })
  }

  test('Plan muestra cada serie de la pirámide en la rutina', async () => {
    await atDay(page, PLAN_VIEW.day)
    await page.getByRole('link', { name: 'Plan' }).or(page.getByRole('button', { name: 'Plan' })).first().click()
    await page.getByText(PLAN_VIEW.routine).click()
    await expect(page.getByText(PLAN_VIEW.line)).toBeVisible()
    await page.screenshot({ path: `${SHOTS}plan-rutina.png`, fullPage: true })
  })

  test('cambiar el día desde la semana y empezar', async () => {
    await atDay(page, CHANGE_DAY.day)
    await page.locator('.wday.today').click()
    await page.getByText(CHANGE_DAY.routine).click()
    await startToday(page)
    const got = await walkSession(page, 'cambiar-dia')
    expect(got.map(e => fmtRows(e.rows))).toEqual(CHANGE_DAY.want.map(fmtRows))
    await discardSession(page)
    await page.locator('.wday.today').click()
    await page.getByText('Volver al plan semanal').click()
  })

  test('elegir otro entrenamiento y empezar', async () => {
    await atDay(page, OTHER_WORKOUT.day)
    await page.getByRole('button', { name: 'Elegir otro entrenamiento' }).click()
    await page.getByText(OTHER_WORKOUT.routine).click()
    const skip = page.getByRole('button', { name: 'Empezar sin pesarse' })
    await skip.waitFor({ timeout: 4000 }).catch(() => {})
    if (await skip.count()) await skip.click()
    await page.waitForURL(/\/workout/)
    const got = await walkSession(page, 'elegir-otro')
    expect(got.map(e => fmtRows(e.rows))).toEqual(OTHER_WORKOUT.want.map(fmtRows))
    await discardSession(page)
  })
})
