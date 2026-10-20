import { describe, it, expect } from 'vitest'
import { buildSets, plannedRows, exLine } from './history.js'
import { nextPrescription } from './progression.js'
import { buildSessionEntries } from './session-start.js'

// A routine exercise can carry its own target per set (`cfg.rows`, [{ w, r }]) — a pyramid
// is 25@20, 18@30 … 25@20, not "7 × 25 @ 20". Without `rows` nothing may change: every
// profile written before this field existed must plan exactly the sessions it planned before.
const PYRAMID = [[25, 20], [18, 30], [15, 40], [12, 50], [10, 60], [8, 70], [25, 20]].map(([r, w]) => ({ w, r }))
const flat = sets => sets.map(s => `${s.r}@${s.w}`)

describe('per-set targets in a routine', () => {
  const st = { unit: 'kg', workouts: [], exWeights: {}, routines: [] }

  it('leaves an exercise without rows exactly as before (sets × reps × weight, progression on)', () => {
    const cfg = { id: '0025', sets: 3, reps: 8, weight: 60 }
    expect(plannedRows(cfg)).toBe(null)
    expect(nextPrescription(st, cfg, { prog: 'linear' }).policy).toBe('linear')
    expect(flat(buildSets(st, cfg, { useTarget: true }))).toEqual(['8@60', '8@60', '8@60'])
    // An empty or malformed list is not a plan either.
    expect(plannedRows({ ...cfg, rows: [] })).toBe(null)
    expect(plannedRows({ ...cfg, rows: [{ w: 'x' }] })).toBe(null)
  })

  it('opens each row of a pyramid at its own weight and reps', () => {
    const cfg = { id: '0025', sets: 7, reps: 25, weight: 20, rows: PYRAMID }
    expect(flat(buildSets(st, cfg, { useTarget: true }))).toEqual(['25@20', '18@30', '15@40', '12@50', '10@60', '8@70', '25@20'])
  })

  it('starts a session from a pyramid routine as written, even with progression and flat history', () => {
    const cfg = { id: '0025', sets: 7, reps: 25, weight: 20, rows: PYRAMID }
    // The last time this lift was logged flat at 80 kg: neither that nor the confirmed weight
    // may flatten the pyramid, and linear progression must not bump it.
    const hist = {
      unit: 'kg', routines: [], exWeights: { '0025': { w: 80, d: '2026-10-01' } },
      workouts: [{ d: '2026-10-01', entries: [{ id: '0025', target: { sets: 3, reps: 5, weight: 80 }, sets: [5, 5, 5].map(r => ({ w: 80, r, done: true })) }] }]
    }
    const [entry] = buildSessionEntries(hist, { id: 'r', prog: 'linear', ex: [cfg] })
    expect(entry.plan.kind).toBe('off')
    expect(flat(entry.sets)).toEqual(['25@20', '18@30', '15@40', '12@50', '10@60', '8@70', '25@20'])
    expect(entry.sets.every(s => s.done === false)).toBe(true)
  })

  it('describes a pyramid in the plan as its rows, not as N sets of the first row', () => {
    // The flat fields mirror row 1, so the old one-liner read "7 × 25 · 20 kg" — seven sets at
    // the bar — on the Plan screen for a lift that climbs to 70 kg.
    const cfg = { id: '0025', sets: 7, reps: 25, weight: 20, rows: PYRAMID }
    expect(exLine(cfg, 'kg')).toBe('25 @ 20 · 18 @ 30 · 15 @ 40 · 12 @ 50 · 10 @ 60 · 8 @ 70 · 25 @ 20 kg')
    expect(exLine({ id: '0025', sets: 3, reps: 10, weight: 40 }, 'kg')).toBe('3 × 10 · 40 kg')
  })
})
