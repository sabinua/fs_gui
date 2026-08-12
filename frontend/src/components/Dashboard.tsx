import {useEffect, useState} from 'react'
import {GetDashboardStats, ListModules} from '../../wailsjs/go/main/App'
import {main} from '../../wailsjs/go/models'
import {Profile, SessionState, stateLabels} from '../types'
import {useT} from '../i18n'
import GlobalVars from './GlobalVars'

interface Props {
  profile: Profile
  state: SessionState
  lastError?: string
}

export default function Dashboard({profile, state, lastError}: Props) {
  const t = useT()
  const [stats, setStats] = useState<main.DashboardStats | null>(null)
  const [err, setErr] = useState('')
  const [showModules, setShowModules] = useState(false)

  useEffect(() => {
    if (state !== 'online') { setStats(null); return }
    let cancelled = false
    const load = () => GetDashboardStats(profile.id)
      .then(s => { if (!cancelled) { setStats(s); setErr('') } })
      .catch(e => { if (!cancelled) setErr(String(e)) })
    load()
    const t = setInterval(load, 5_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [profile.id, state])

  if (state !== 'online') {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-edge bg-surface-2 p-4 text-sm text-ink-muted">
          {t(stateLabels[state])}{lastError ? ` — ${lastError}` : ''}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold">{profile.name}</h1>
        {stats && (
          <span className="text-xs text-ink-faint">
            FreeSWITCH {stats.version} · uptime {stats.uptimeText}
          </span>
        )}
      </div>

      {err && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label={t('Активні дзвінки')} value={stats.callsCount}/>
            <StatTile label={t('Сесії')} value={stats.activeSessions}
                      hint={t('пік {peak} · макс {max}', {peak: stats.peakSessions, max: stats.maxSessions})}/>
            <StatTile label={t('Сесій/с')} value={stats.sessionsPerSec}
                      hint={t('макс {max}', {max: stats.maxSessionsRate})}/>
            <StatTile label={t('Сесій від старту')} value={stats.sessionsTotal}/>
            <StatTile label="Idle CPU" value={stats.idleCpu ? `${stats.idleCpu}%` : '—'}/>
          </div>

          <section className="rounded-lg border border-edge bg-surface-2">
            <header className="border-b border-edge px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {t('Sofia-профілі')}
            </header>
            {stats.sofiaProfiles?.length
              ? (
                <table className="w-full text-sm">
                  <tbody>
                  {stats.sofiaProfiles.map((p, i) => (
                    <tr key={i} className="border-b border-edge/50 last:border-0">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-2 py-2 text-ink-faint">{p.type}</td>
                      <td className="select-text px-2 py-2 font-mono text-xs text-ink-muted">{p.data}</td>
                      <td className="px-4 py-2 text-right">
                        <StateBadge state={p.state}/>
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              )
              : <div className="px-4 py-3 text-sm text-ink-faint">{t('Немає даних (mod_sofia не завантажено?)')}</div>}
          </section>

          <GlobalVars connId={profile.id}/>

          <button onClick={() => setShowModules(true)}
                  className="rounded-lg border border-edge bg-surface-2 px-4 py-3 text-left hover:bg-surface-3">
            <div className="text-xs text-ink-faint">{t('Завантажені модулі')}</div>
            <div className="text-xl font-semibold">{stats.moduleCount} <span className="text-sm font-normal text-ink-muted">{t('— переглянути список')}</span></div>
          </button>
        </>
      )}

      {showModules && <ModulesModal connId={profile.id} onClose={() => setShowModules(false)}/>}
    </div>
  )
}

function StatTile({label, value, hint}: {label: string; value: number | string; hint?: string}) {
  return (
    <div className="rounded-lg border border-edge bg-surface-2 px-4 py-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-ink-dim">{hint}</div>}
    </div>
  )
}

function StateBadge({state}: {state: string}) {
  const running = state.startsWith('RUNNING')
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs
      ${running ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-green-500' : 'bg-amber-500'}`}/>
      {state}
    </span>
  )
}

function ModulesModal({connId, onClose}: {connId: string; onClose: () => void}) {
  const t = useT()
  const [modules, setModules] = useState<{name: string; type: string}[]>([])
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    ListModules(connId).then(setModules).catch(e => setErr(String(e)))
  }, [connId])

  const shown = modules.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="flex h-[70vh] w-[420px] flex-col rounded-xl border border-edge bg-surface-2 p-4 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('Модулі ({n})', {n: modules.length})}</h2>
          <button onClick={onClose} className="px-2 text-ink-faint hover:text-ink-strong">×</button>
        </div>
        <input autoFocus placeholder={t('Фільтр…')} value={filter} onChange={e => setFilter(e.target.value)}
               className="mb-2 rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>
        {err && <div className="text-sm text-red-500">{err}</div>}
        <div className="flex-1 overflow-y-auto">
          {shown.map(m => (
            <div key={m.name} className="flex justify-between border-b border-edge/40 px-1 py-1.5 text-sm last:border-0">
              <span className="select-text font-mono">{m.name}</span>
              <span className="text-xs text-ink-faint">{m.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
