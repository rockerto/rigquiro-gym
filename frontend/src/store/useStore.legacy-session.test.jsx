// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast }) } }))

// Tuesday 20-oct: the phone started the session on a build without per-set targets and laid
// the press out as 7 × 20 kg × 12. That session sits in the phone's saved state. Whatever
// build opens it next must show the pyramid — on the very first load, before any tap.
const PYRAMID = [[12, 20], [9, 30], [7, 40], [6, 50], [5, 60], [4, 70], [12, 20]].map(([r, w]) => ({ w, r }))
const press = { id: 'press', sets: 7, reps: 12, weight: 20, rows: PYRAMID }
const routine = { id: 'tue', name: 'Brazos y hombros · 50% semana 0', prog: 'off', ex: [press] }
const legacyActive = () => ({
  id: 's1', d: '2026-10-20', start: 1, routineIds: ['tue'], name: routine.name, bw: null, cur: 0,
  entries: [{ id: 'press', rid: 'tue', target: { ...press }, plan: { policy: 'off', kind: 'off' },
    sets: Array.from({ length: 7 }, () => ({ w: 20, r: 12, done: false })) }],
})
const flat = sets => sets.map(s => `${s.r}@${s.w}`)
const WANT = ['12@20', '9@30', '7@40', '6@50', '5@60', '4@70', '12@20']

beforeEach(() => { localStorage.clear(); vi.resetModules() })
afterEach(() => localStorage.clear())

describe('a running session saved by an older build', () => {
  it('is replanned when the app loads it from storage', async () => {
    localStorage.setItem('gym_state_v1', JSON.stringify({ routines: [routine], workouts: [], active: legacyActive() }))
    const { useStore } = await import('./useStore.js')
    const { active } = useStore.getState().S
    expect(flat(active.entries[0].sets)).toEqual(WANT)
    expect(active.planV).toBeGreaterThanOrEqual(2)
  })

  it('is replanned when it arrives later (file mirror, restore) and is written back that way', async () => {
    const { useStore, DEF } = await import('./useStore.js')
    useStore.getState().replaceState({ ...JSON.parse(JSON.stringify(DEF)), routines: [routine], active: legacyActive() })
    expect(flat(useStore.getState().S.active.entries[0].sets)).toEqual(WANT)
    expect(flat(JSON.parse(localStorage.getItem('gym_state_v1')).active.entries[0].sets)).toEqual(WANT)
  })
})
