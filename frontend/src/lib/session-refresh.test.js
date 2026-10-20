import { describe, it, expect } from 'vitest'
import { refreshLegacySession, SESSION_PLAN_VERSION, buildSessionEntries } from './session-start.js'

// The phone that started Tuesday's session ran a build from before per-set targets existed: it
// laid the pyramid out flat, every row at the first row's numbers (7 × 20 kg × 12). That session
// lives on the device (S.active), so a newer build that merely resumes it would keep showing the
// wrong numbers. The rows nobody has logged yet must come back as the plan wrote them; what was
// logged stays exactly as logged.
const PYRAMID = [[12, 20], [9, 30], [7, 40], [6, 50], [5, 60], [4, 70], [12, 20]].map(([r, w]) => ({ w, r }))
const flat = sets => sets.map(s => `${s.r}@${s.w}`)
const press = { id: 'press', sets: 7, reps: 12, weight: 20, rows: PYRAMID }
const curl = { id: 'curl', sets: 4, reps: 5, weight: 40 }
const routine = { id: 'tue', name: 'Brazos y hombros · 50% semana 0', prog: 'off', ex: [press, curl] }

// Exactly what the old build put in S.active: a copy of the routine config as the target, and
// flat rows at sets × reps × weight.
const legacyEntry = (cfg, rows) => ({ id: cfg.id, target: { ...cfg }, plan: { policy: 'off', kind: 'off' }, rid: 'tue', sets: rows })
const oldSession = (pressRows) => ({
  id: 's1', d: '2026-10-20', start: 1, routineIds: ['tue'], name: routine.name, bw: null, cur: 0,
  entries: [
    legacyEntry(press, pressRows || Array.from({ length: 7 }, () => ({ w: 20, r: 12, done: false }))),
    legacyEntry(curl, Array.from({ length: 4 }, () => ({ w: 40, r: 5, done: false }))),
  ],
})
const state = active => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [routine], active })

describe('a session started by a build that did not know per-set targets', () => {
  it('rebuilds the pyramid rows nobody has logged yet', () => {
    const next = refreshLegacySession(state(oldSession()))
    expect(flat(next.entries[0].sets)).toEqual(['12@20', '9@30', '7@40', '6@50', '5@60', '4@70', '12@20'])
    expect(next.planV).toBe(SESSION_PLAN_VERSION)
  })

  it('keeps logged sets as they were and plans the rest from where they stop', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ w: 20, r: 12, done: i < 2 }))
    const next = refreshLegacySession(state(oldSession(rows)))
    const sets = next.entries[0].sets
    expect(sets.slice(0, 2)).toEqual([{ w: 20, r: 12, done: true }, { w: 20, r: 12, done: true }])
    expect(flat(sets.slice(2))).toEqual(['7@40', '6@50', '5@60', '4@70', '12@20'])
    expect(sets.slice(2).every(s => !s.done)).toBe(true)
  })

  it('does not touch an exercise without per-set targets, nor the session around it', () => {
    const before = oldSession()
    const next = refreshLegacySession(state(before))
    expect(next.entries[1]).toEqual(before.entries[1])
    for (const k of ['id', 'd', 'start', 'routineIds', 'name', 'cur']) expect(next[k]).toEqual(before[k])
  })

  it('leaves a session built by the current code alone, so in-session edits survive', () => {
    const st = state(null)
    const entries = buildSessionEntries(st, routine).map(e => ({ ...e, rid: 'tue' }))
    entries[0].sets[1] = { ...entries[0].sets[1], w: 32.5 }   // a deliberate change during the session
    const current = { ...oldSession(), entries, planV: SESSION_PLAN_VERSION }
    expect(refreshLegacySession(state(current))).toBe(null)
  })

  it('has nothing to do without a session, or for one without per-set targets', () => {
    expect(refreshLegacySession(state(null))).toBe(null)
    const plain = { ...oldSession(), entries: [oldSession().entries[1]] }
    expect(refreshLegacySession(state(plain))).toBe(null)
  })

  it('reads the plan from the routine as it stands now, when the session predates the pyramid', () => {
    // Started while the routine still said "7 × 12 @ 20" (no rows), resumed after the plan got
    // its per-set targets: the routine is the prescription.
    const s = oldSession()
    s.entries[0].target = { id: 'press', sets: 7, reps: 12, weight: 20 }
    const next = refreshLegacySession(state(s))
    expect(flat(next.entries[0].sets)).toEqual(['12@20', '9@30', '7@40', '6@50', '5@60', '4@70', '12@20'])
    expect(next.entries[0].target.rows).toEqual(PYRAMID)
  })
})
