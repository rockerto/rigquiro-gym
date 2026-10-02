// Rehabilitación — estiramientos y movilidad suave por articulación, curados de la
// biblioteca. NO es un plan de rehab: lleva un disclaimer visible arriba. Pensado para
// pacientes de un quiropráctico, como apoyo, nunca como reemplazo del kinesiólogo.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EXDB } from '../lib/exercises.js'
import { t, exerciseNameFor, instrFor } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Thumb } from '../components/Media.jsx'

const exById = id => EXDB.find(e => e.id === id)

// 2-3 ejercicios suaves (estiramiento / movilidad) por articulación.
const ARTIC = [
  { k: 'cuello',  label: 'Cuello',            icon: 'figureStrength', ids: ['1403', '0716'] },
  { k: 'hombro',  label: 'Hombro',            icon: 'arm',            ids: ['0669', '1271'] },
  { k: 'codo',    label: 'Codo y brazo',      icon: 'arm',            ids: ['0643', '0817'] },
  { k: 'muneca',  label: 'Muñeca y mano',     icon: 'arm',            ids: ['0721'] },
  { k: 'espalda', label: 'Espalda y columna', icon: 'pullup',         ids: ['1346', '1341', '1405'] },
  { k: 'cadera',  label: 'Cadera',            icon: 'legs',           ids: ['1709', '1710', '1512'] },
  { k: 'rodilla', label: 'Rodilla',           icon: 'legs',           ids: ['0257', '1548', '1713'] },
  { k: 'tobillo', label: 'Tobillo',           icon: 'legs',           ids: ['1368', '1377', '1390'] },
]

export default function Rehab() {
  const nav = useNavigate()
  const [open, setOpen] = useState(null)

  return (
    <div style={{ minHeight: '100vh', padding: '18px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <button className="iconbtn" onClick={() => nav('/home')} aria-label="Atrás"><Icon name="chevronLeft" /></button>
        <div style={{ fontSize: 13, color: 'var(--label-2)' }}>Rehabilitación</div>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', margin: '4px 2px 14px' }}>Ejercicios de rehabilitación</h1>

      {/* Disclaimer — visible, siempre arriba */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--orange) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--orange) 40%, transparent)', borderRadius: 16, padding: '14px 16px', marginBottom: 20 }}>
        <span style={{ color: 'var(--orange)', display: 'flex', flex: 'none', marginTop: 1 }}><Icon name="warning" size={20} /></span>
        <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--label)' }}>
          <b>Esto no reemplaza la rehabilitación kinésica.</b> Son ejercicios suaves de apoyo.
          Ante dolor, lesión o después de una operación, consulta primero a tu kinesiólogo o médico.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ARTIC.map(a => {
          const on = open === a.k
          const exs = a.ids.map(exById).filter(Boolean)
          return (
            <div key={a.k} style={{ background: 'var(--surface)', border: '1px solid var(--sep-op)', borderRadius: 16, overflow: 'hidden' }}>
              <button onClick={() => setOpen(on ? null : a.k)} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '16px', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--label)' }}>
                <span style={{ color: 'var(--acc)', display: 'flex', flex: 'none' }}><Icon name={a.icon} size={26} /></span>
                <span style={{ fontWeight: 600, fontSize: 16, flex: 1, textAlign: 'left' }}>{a.label}</span>
                <span style={{ fontSize: 13, color: 'var(--label-2)' }}>{exs.length} ejercicios</span>
                <span style={{ color: 'var(--label-3)', display: 'flex', transform: on ? 'rotate(90deg)' : 'none', transition: '.2s' }}><Icon name="chevronRight" size={18} /></span>
              </button>
              {on && (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {exs.map(e => (
                    <div key={e.id} style={{ background: 'var(--bg)', border: '1px solid var(--sep-op)', borderRadius: 14, padding: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 76, height: 76, borderRadius: 10, overflow: 'hidden', flex: 'none', background: '#0d0d0d' }}><Thumb ex={e} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 3 }}>{exerciseNameFor(e) || e.n}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--label-2)', lineHeight: 1.4 }}>
                          {(instrFor(e) || e.st || []).slice(0, 2).join(' ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
