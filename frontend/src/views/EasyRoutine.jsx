// Modo Fácil — arma una rutina en 4 toques (zona · equipo · nivel · tiempo) para
// pacientes que no saben de gimnasio. Reusa el motor: genera una rutina desde la
// biblioteca y la inicia con startFlow. Iconos SVG propios de la app (sin emojis).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXDB } from '../lib/exercises.js'
import { uid } from '../lib/format.js'
import { startFlow } from '../sheets.jsx'
import { t, exerciseNameFor } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'

const ZONAS = [
  { k: 'chest',     label: 'Pecho',           icon: 'figureStrength', bp: ['chest'] },
  { k: 'back',      label: 'Espalda',         icon: 'pullup',         bp: ['back'] },
  { k: 'legs',      label: 'Piernas',         icon: 'legs',           bp: ['upper legs', 'lower legs'] },
  { k: 'shoulders', label: 'Hombros',         icon: 'figureRun',      bp: ['shoulders'] },
  { k: 'arms',      label: 'Brazos',          icon: 'arm',            bp: ['upper arms', 'lower arms'] },
  { k: 'core',      label: 'Abdomen',         icon: 'abs',            bp: ['waist'] },
  { k: 'full',      label: 'Cuerpo completo', icon: 'flame',          bp: ['chest', 'back', 'upper legs', 'shoulders', 'upper arms', 'waist'] },
]
const EQUIPOS = [
  { k: 'bw', label: 'Peso corporal', icon: 'figureStrength', eq: ['body weight'] },
  { k: 'db', label: 'Mancuernas',    icon: 'dumbbell',       eq: ['dumbbell'] },
  { k: 'mc', label: 'Máquinas',      icon: 'machine',        eq: ['leverage machine', 'cable', 'smith machine', 'sled machine'] },
  { k: 'kb', label: 'Kettlebell',    icon: 'kettlebell',     eq: ['kettlebell'] },
  { k: 'bd', label: 'Banda / cuerda', icon: 'stretch',       eq: ['band', 'resistance band', 'rope'] },
  { k: 'bb', label: 'Barra',         icon: 'barbell',        eq: ['barbell', 'ez barbell', 'olympic barbell'] },
]
const NIVELES = [
  { k: 'facil',  label: 'Principiante', sub: 'Recién empiezo',  icon: 'sparkles', sets: 3, reps: 12 },
  { k: 'medio',  label: 'Intermedio',   sub: 'Ya entreno',      icon: 'bolt',     sets: 3, reps: 10 },
  { k: 'fuerte', label: 'Avanzado',     sub: 'Con experiencia', icon: 'flame',    sets: 4, reps: 8 },
]
const TIEMPOS = [
  { k: 15, label: '15 min', sub: 'Rápido',   icon: 'bolt',  n: 3 },
  { k: 30, label: '30 min', sub: 'Completo', icon: 'timer', n: 5 },
  { k: 45, label: '45 min', sub: 'A fondo',  icon: 'clock', n: 7 },
]

function generar(zona, equipo, nivel, tiempo) {
  let pool = EXDB.filter(e => zona.bp.includes(e.bp) && equipo.eq.includes(e.eq))
  if (pool.length < tiempo.n) pool = EXDB.filter(e => zona.bp.includes(e.bp)) // relaja el equipo si no alcanza
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const picked = [], seenTg = new Set()
  for (const e of shuffled) { if (picked.length >= tiempo.n) break; if (!seenTg.has(e.tg)) { picked.push(e); seenTg.add(e.tg) } }
  for (const e of shuffled) { if (picked.length >= tiempo.n) break; if (!picked.includes(e)) picked.push(e) }
  return picked.slice(0, tiempo.n)
}

export default function EasyRoutine() {
  const nav = useNavigate()
  const update = useStore(s => s.update)
  const [step, setStep] = useState(0)
  const [zona, setZona] = useState(null)
  const [equipo, setEquipo] = useState(null)
  const [nivel, setNivel] = useState(null)
  const [tiempo, setTiempo] = useState(null)
  const [rutina, setRutina] = useState(null)

  const PASOS = [
    { q: '¿Qué quieres trabajar hoy?', opts: ZONAS,   sel: zona,   set: (v) => { setZona(v); setStep(1) } },
    { q: '¿Con qué vas a entrenar?',   opts: EQUIPOS, sel: equipo, set: (v) => { setEquipo(v); setStep(2) } },
    { q: '¿Cuál es tu nivel?',         opts: NIVELES, sel: nivel,  set: (v) => { setNivel(v); setStep(3) } },
    { q: '¿Cuánto tiempo tienes?',     opts: TIEMPOS, sel: tiempo, set: (v) => { armar(v) } },
  ]

  function armar(tSel) {
    setTiempo(tSel)
    setRutina(generar(zona, equipo, nivel, tSel))
    setStep(4)
  }

  function empezar() {
    const { sets, reps } = nivel
    const routine = {
      id: uid(),
      name: `${zona.label} · ${tiempo.label}`,
      emoji: 'barbell',
      ex: rutina.map(e => ({ id: e.id, sets, reps, weight: 0 })),
    }
    update(s => { s.routines.push(routine) })
    startFlow([routine.id])
    nav('/workout')
  }

  const wrap = { minHeight: '100vh', padding: '18px 16px 40px', display: 'flex', flexDirection: 'column' }
  const bigBtn = (selected) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '24px 12px', borderRadius: 20, cursor: 'pointer', textAlign: 'center',
    background: selected ? 'var(--acc)' : 'var(--surface)',
    color: selected ? 'var(--on-acc)' : 'var(--label)',
    border: '1px solid ' + (selected ? 'var(--acc)' : 'var(--sep-op)'),
    boxShadow: selected ? '0 10px 26px -12px var(--acc)' : 'none', transition: '.15s',
  })

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="iconbtn" onClick={() => step === 0 ? nav('/home') : setStep(step - 1)} aria-label="Atrás"><Icon name="chevronLeft" /></button>
        <div style={{ fontSize: 13, color: 'var(--label-2)' }}>{step < 4 ? `Paso ${step + 1} de 4` : 'Tu rutina'}</div>
      </div>

      {step < 4 && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 2px 20px' }}>{PASOS[step].q}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {PASOS[step].opts.map(o => {
              const on = PASOS[step].sel?.k === o.k
              return (
                <button key={o.k} style={bigBtn(on)} onClick={() => PASOS[step].set(o)}>
                  <span style={{ color: on ? 'var(--on-acc)' : 'var(--acc)', display: 'flex' }}><Icon name={o.icon} size={36} /></span>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{o.label}</span>
                  {o.sub && <span style={{ fontSize: 12, opacity: .72 }}>{o.sub}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {step === 4 && rutina && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 2px 4px' }}>
            <span style={{ color: 'var(--acc)', display: 'flex' }}><Icon name="trophy" size={26} /></span>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>¡Rutina lista!</h1>
          </div>
          <div style={{ color: 'var(--label-2)', margin: '0 2px 18px', fontSize: 15 }}>
            {zona.label} · {equipo.label} · {nivel.label} · {tiempo.label} · {rutina.length} ejercicios
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {rutina.map((e, i) => (
              <div key={e.id + i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--sep-op)', borderRadius: 16, padding: 10 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flex: 'none', background: '#0d0d0d' }}><Thumb ex={e} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{exerciseNameFor(e) || e.n}</div>
                  <div style={{ fontSize: 13, color: 'var(--acc)' }}>{nivel.sets} series × {nivel.reps} reps</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            <button onClick={empezar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '18px', borderRadius: 999, border: 0, cursor: 'pointer', background: 'var(--acc)', color: 'var(--on-acc)', fontWeight: 700, fontSize: 18, boxShadow: '0 12px 28px -12px var(--acc)' }}><Icon name="play" size={20} /> ¡Empezar!</button>
            <button onClick={() => armar(tiempo)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', borderRadius: 999, border: '1px solid var(--sep)', cursor: 'pointer', background: 'transparent', color: 'var(--label)', fontWeight: 600, fontSize: 15 }}><Icon name="shuffle" size={17} /> Otra rutina</button>
          </div>
        </>
      )}
    </div>
  )
}
