// How a session's exercise entries are built from a routine. Shared by the live start and by
// "log a past workout", which is the same screen pointed at another day — both must walk up
// to identical entries, or the two paths drift apart the first time a prescription rule changes.
// Imports both history.js and progression.js (which itself imports history.js); nothing in
// either imports this file, so there is no cycle.
import { buildSets, applyIntensifierPlan, modeOf, plannedRows } from './history.js'
import { nextPrescription, applyPrescription, defaultIncrement, weightIncrement } from './progression.js'
import { isWarmupRow } from './workout-model.js'

// Stamped on every session this code starts (`active.planV`). A session without it was laid
// out by a build that predates per-set targets (`cfg.rows`) and may show a pyramid flat.
export const SESSION_PLAN_VERSION = 2

// Returns a bare array of session entries. "Excluded from progression" is per-entry now
// (`entry.noProg`, written only when true) rather than a wrapper flag — a rehab routine merged
// into real work must exclude only its own exercises. The merge helper (lib/session-merge.js)
// stamps `entry.rid`; this builder is unaware of which routine it serves, so the single-routine
// and combined paths share it unchanged.
export function buildSessionEntries(st, r) {
  // The prescription is applied as the session is built, so you walk up to the bar with the
  // right weight already on the screen instead of being told about it afterwards. `plan` is
  // kept on the entry purely so the workout can explain the number it chose.
  const noProg = r?.excludeFromProgression === true
  return (r ? r.ex : []).map(cfg => buildEntry(st, cfg, r, noProg))
}

function buildEntry(st, cfg, r, noProg) {
  const plan = noProg ? { policy: 'off', kind: 'off' } : nextPrescription(st, cfg, r)
  // The warm-up ramp and the prescription snap to the exercise's own increment (1.25 kg
  // plates exist), not the unit default; a timed exercise's `inc` is seconds, so it keeps the
  // default for its optional load.
  const step = modeOf(cfg) === 'reps' ? weightIncrement(cfg, st.unit) : defaultIncrement(cfg.id, st.unit)
  const sets = applyIntensifierPlan(applyPrescription(buildSets(st, cfg, { step, useTarget: plan.kind === 'off' }), plan, step), cfg)
  const target = { ...cfg }
  if (plan.weight != null) target.weight = plan.weight
  if (plan.reps != null) target.reps = plan.reps
  if (plan.sec != null) target.sec = plan.sec
  if (plan.sets != null) target.sets = plan.sets
  return { id: cfg.id, sg: cfg.sg, target, plan, sets, ...(noProg ? { noProg: true } : {}) }
}

/**
 * The in-progress session (`st.active`) brought up to per-set targets, or null when there is
 * nothing to do (no session, one this code started, or one without per-set targets). For each exercise whose routine — as
 * it stands now, else the copy the session kept — has per-set targets, the rows not yet logged
 * are planned again; logged rows stay exactly as logged, the same rule an in-session config
 * edit follows. Everything else in the session is left as it is.
 */
export function refreshLegacySession(st) {
  const a = st && st.active
  if (!a || a.planV >= SESSION_PLAN_VERSION) return null
  const seen = new Map()
  let touched = false
  const entries = (a.entries || []).map(e => {
    const routine = e.rid ? (st.routines || []).find(r => r.id === e.rid) : null
    // The same exercise can sit twice in one routine: match occurrence to occurrence.
    const key = (e.rid || '') + '|' + e.id
    const nth = seen.get(key) || 0
    seen.set(key, nth + 1)
    const cfg = (routine ? (routine.ex || []).filter(c => c.id === e.id)[nth] : null) || e.target
    if (!cfg || !plannedRows(cfg)) return e
    const old = e.sets || []
    // What an old build left behind is flat: every work row at row 1's numbers. Rows that already
    // differ were laid out by a build that knew per-set targets (or edited by hand) — kept.
    const work = old.filter(x => !isWarmupRow(x))
    if (work.some(x => Number(x.w) !== Number(work[0].w) || Number(x.r) !== Number(work[0].r))) return e
    touched = true
    const fresh = buildEntry(st, { ...cfg, id: e.id }, routine, e.noProg === true)
    // A unilateral row with only one side logged is logged.
    const logged = x => x.done || x.sides?.L?.done || x.sides?.R?.done
    const doneWarm = old.filter(x => logged(x) && isWarmupRow(x))
    const doneWork = old.filter(x => logged(x) && !isWarmupRow(x))
    const freshWarm = fresh.sets.filter(isWarmupRow)
    const freshWork = fresh.sets.filter(x => !isWarmupRow(x))
    return { ...e, target: fresh.target, plan: fresh.plan,
      sets: [...doneWarm, ...freshWarm.slice(doneWarm.length), ...doneWork, ...freshWork.slice(doneWork.length)] }
  })
  // Nothing with per-set targets: the session is left byte-for-byte as it was.
  return touched ? { ...a, entries, planV: SESSION_PLAN_VERSION } : null
}
