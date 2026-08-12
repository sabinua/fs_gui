import {useCallback, useEffect, useRef, useState} from 'react'
import {PluginCall} from '../../wailsjs/go/main/App'
import {useFSEvents} from '../hooks/useFSEvents'
import {useT} from '../i18n'

type Row = Record<string, string>

const STATUSES = ['Available', 'Available (On Demand)', 'On Break', 'Logged Out']

function cc(connId: string, method: string, args: Record<string, string> = {}) {
  return PluginCall(connId, 'callcenter', method, args)
}

export default function CallCenter({connId}: {connId: string}) {
  const t = useT()
  const [tab, setTab] = useState<'agents' | 'queues'>('agents')
  const [agents, setAgents] = useState<Row[]>([])
  const [queues, setQueues] = useState<Row[]>([])
  const [tiers, setTiers] = useState<Row[]>([])
  const [err, setErr] = useState('')

  const reload = useCallback(() => {
    Promise.all([cc(connId, 'agents'), cc(connId, 'queues'), cc(connId, 'tiers')])
      .then(([a, q, t]) => { setAgents(a || []); setQueues(q || []); setTiers(t || []); setErr('') })
      .catch(e => setErr(String(e)))
  }, [connId])

  useEffect(reload, [reload])

  // Live refresh on any callcenter event, debounced.
  const timer = useRef<number | undefined>(undefined)
  useFSEvents(connId, ev => {
    if (ev.name !== 'CUSTOM callcenter::info') return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(reload, 400)
  })

  return (
    <div className="p-6">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Call Center</h1>
        <div className="flex gap-1 rounded-md bg-surface-3 p-1 text-sm">
          {([['agents', t('Агенти ({n})', {n: agents.length})], ['queues', t('Черги ({n})', {n: queues.length})]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
                    className={`rounded px-3 py-1 text-xs ${tab === id ? 'bg-surface text-ink-strong' : 'text-ink-muted hover:text-ink-strong'}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={reload}
                className="ml-auto rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3">
          {t('⟳ Оновити')}
        </button>
      </div>

      {err && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

      {tab === 'agents' && <Agents connId={connId} agents={agents} onChanged={reload}/>}
      {tab === 'queues' && <Queues connId={connId} queues={queues} agents={agents} tiers={tiers} onChanged={reload}/>}
    </div>
  )
}

// ---------------- Agents ----------------

function Agents({connId, agents, onChanged}: {connId: string; agents: Row[]; onChanged: () => void}) {
  const t = useT()
  const [showAdd, setShowAdd] = useState(false)

  const setField = async (name: string, field: string, value: string) => {
    try {
      await cc(connId, 'agent_set', {name, field, value})
      onChanged()
    } catch (e) { alert(String(e)) }
  }

  const del = async (name: string) => {
    if (!confirm(t('Видалити агента {name}? Його tiers буде втрачено.', {name}))) return
    try {
      await cc(connId, 'agent_del', {name})
      onChanged()
    } catch (e) { alert(String(e)) }
  }

  return (
    <>
      <div className="mb-3">
        <button onClick={() => setShowAdd(true)}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500">
          {t('+ Додати агента')}
        </button>
      </div>

      {agents.length === 0
        ? <Empty text={t('Немає агентів')}/>
        : (
          <div className="overflow-x-auto rounded-lg border border-edge bg-surface-2">
            <table className="w-full text-sm">
              <thead>
              <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2 font-medium">{t('Агент')}</th>
                <th className="px-2 py-2 font-medium">{t('Контакт')}</th>
                <th className="px-2 py-2 font-medium">{t('Статус')}</th>
                <th className="px-2 py-2 font-medium">{t('Стан')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('Прийнято')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('Пропущено')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('Розмови')}</th>
                <th className="px-4 py-2 text-right font-medium"></th>
              </tr>
              </thead>
              <tbody>
              {agents.map(a => (
                <tr key={a.name} className="border-b border-edge/50 last:border-0 hover:bg-surface-3/50">
                  <td className="select-text px-4 py-2 font-mono font-medium">{a.name}</td>
                  <td className="max-w-52 px-2 py-2 font-mono text-xs text-ink-muted">
                    <DblEdit value={a.contact} onSave={v => setField(a.name, 'contact', v)}/>
                  </td>
                  <td className="px-2 py-2">
                    <select value={a.status} onChange={e => setField(a.name, 'status', e.target.value)}
                            className={`rounded-md border border-edge bg-surface-3 px-2 py-1 text-xs outline-none ${statusColor(a.status)}`}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2"><AgentState state={a.state}/></td>
                  <td className="px-2 py-2 text-right tabular-nums">{a.calls_answered}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{a.no_answer_count}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtSec(a.talk_time)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => del(a.name)} title={t('Видалити')}
                            className="rounded-md border border-edge px-2 py-1 text-xs text-ink-muted hover:bg-red-500/20 hover:text-red-500">✕</button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}

      {showAdd && <AddAgentDialog connId={connId} onClose={saved => { setShowAdd(false); if (saved) onChanged() }}/>}
    </>
  )
}

function AddAgentDialog({connId, onClose}: {connId: string; onClose: (saved: boolean) => void}) {
  const t = useT()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState('Logged Out')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const inputCls = 'w-full rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400'

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await cc(connId, 'agent_add', {name: name.trim(), contact: contact.trim(), status})
      onClose(true)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => onClose(false)}>
      <div className="w-[420px] rounded-xl border border-edge bg-surface-2 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-semibold">{t('Новий агент')}</h2>
        <label className="mb-1 block text-xs text-ink-muted">{t('Ім’я (наприклад 1000@default)')}</label>
        <input autoFocus className={inputCls + ' mb-3 font-mono'} value={name} onChange={e => setName(e.target.value)}/>
        <label className="mb-1 block text-xs text-ink-muted">{t('Контакт')}</label>
        <input className={inputCls + ' mb-3 font-mono'} placeholder="[call_timeout=10]user/1000"
               value={contact} onChange={e => setContact(e.target.value)}/>
        <label className="mb-1 block text-xs text-ink-muted">{t('Початковий статус')}</label>
        <select className={inputCls + ' mb-4'} value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {err && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={() => onClose(false)} className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-3">{t('Скасувати')}</button>
          <button onClick={save} disabled={busy || !name.trim()}
                  className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">
            {t('Створити')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------- Queues ----------------

function Queues({connId, queues, agents, tiers, onChanged}: {
  connId: string; queues: Row[]; agents: Row[]; tiers: Row[]; onChanged: () => void
}) {
  const t = useT()
  const [selected, setSelected] = useState<string | null>(null)
  const [members, setMembers] = useState<Row[]>([])

  const loadMembers = useCallback((queue: string) => {
    cc(connId, 'members', {queue}).then(m => setMembers(m || [])).catch(() => setMembers([]))
  }, [connId])

  useEffect(() => {
    if (selected) loadMembers(selected)
  }, [selected, loadMembers, tiers]) // tiers changes when reload() ran → refresh members too

  if (queues.length === 0) return <Empty text={t('Немає черг. Черги описуються в callcenter.conf.xml на сервері.')}/>

  return (
    <div className="flex gap-4">
      <div className="w-72 shrink-0 space-y-2">
        {queues.map(q => {
          const qTiers = tiers.filter(t => t.queue === q.name)
          return (
            <button key={q.name} onClick={() => setSelected(q.name)}
                    className={`w-full rounded-lg border p-3 text-left hover:bg-surface-3
                      ${selected === q.name ? 'border-green-500/50 bg-surface-3' : 'border-edge bg-surface-2'}`}>
              <div className="select-text font-mono text-sm font-medium">{q.name}</div>
              <div className="mt-1 text-xs text-ink-faint">
                {q.strategy} · {t('агентів: {n}', {n: qTiers.length})}
              </div>
            </button>
          )
        })}
      </div>

      <div className="min-w-0 flex-1">
        {selected
          ? <QueueDetail connId={connId} queue={selected} members={members}
                         tiers={tiers.filter(t => t.queue === selected)}
                         agents={agents} onChanged={onChanged}/>
          : <Empty text={t('Оберіть чергу зліва')}/>}
      </div>
    </div>
  )
}

function QueueDetail({connId, queue, members, tiers, agents, onChanged}: {
  connId: string; queue: string; members: Row[]; tiers: Row[]; agents: Row[]; onChanged: () => void
}) {
  const t = useT()
  const [addAgent, setAddAgent] = useState('')
  const [level, setLevel] = useState('1')
  const [position, setPosition] = useState('1')

  const freeAgents = agents.filter(a => !tiers.some(t => t.agent === a.name))

  const tierAdd = async () => {
    if (!addAgent) return
    try {
      await cc(connId, 'tier_add', {queue, agent: addAgent, level, position})
      setAddAgent('')
      onChanged()
    } catch (e) { alert(String(e)) }
  }

  const tierDel = async (agent: string) => {
    if (!confirm(t('Прибрати {agent} з черги {queue}?', {agent, queue}))) return
    try {
      await cc(connId, 'tier_del', {queue, agent})
      onChanged()
    } catch (e) { alert(String(e)) }
  }

  const tierSet = async (agent: string, field: 'level' | 'position', value: string) => {
    try {
      await cc(connId, 'tier_set', {queue, agent, field, value})
      onChanged()
    } catch (e) { alert(String(e)) }
  }

  const waiting = members.filter(m => m.state === 'Waiting' || m.state === 'Trying')

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-edge bg-surface-2">
        <header className="flex items-center gap-2 border-b border-edge px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {t('У черзі зараз')}
          <span className="rounded-full bg-surface-3 px-2 py-0.5 tabular-nums text-ink-muted">{waiting.length}</span>
        </header>
        {members.length === 0
          ? <div className="px-4 py-3 text-sm text-ink-faint">{t('Черга порожня')}</div>
          : (
            <table className="w-full text-sm">
              <tbody>
              {members.map((m, i) => (
                <tr key={i} className="border-b border-edge/50 last:border-0">
                  <td className="px-4 py-2">{m.cid_name || m.cid_number}</td>
                  <td className="select-text px-2 py-2 font-mono text-xs">{m.cid_number}</td>
                  <td className="px-2 py-2 text-xs text-ink-faint">{t('чекає {t}', {t: waitTime(m.joined_epoch)})}</td>
                  <td className="px-2 py-2 text-xs">{m.state}</td>
                  <td className="select-text px-4 py-2 text-right font-mono text-xs text-ink-muted">{m.serving_agent !== 'none' ? m.serving_agent : ''}</td>
                </tr>
              ))}
              </tbody>
            </table>
          )}
      </section>

      <section className="rounded-lg border border-edge bg-surface-2">
        <header className="border-b border-edge px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {t('Агенти черги (tiers)')}
        </header>
        {tiers.length === 0
          ? <div className="px-4 py-3 text-sm text-ink-faint">{t('До черги не прив’язано агентів')}</div>
          : (
            <table className="w-full text-sm">
              <thead>
              <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2 font-medium">{t('Агент')}</th>
                <th className="px-2 py-2 font-medium">{t('Стан')}</th>
                <th className="px-2 py-2 font-medium">Level</th>
                <th className="px-2 py-2 font-medium">Position</th>
                <th className="px-4 py-2"></th>
              </tr>
              </thead>
              <tbody>
              {tiers.map(t => (
                <tr key={t.agent} className="border-b border-edge/50 last:border-0">
                  <td className="select-text px-4 py-2 font-mono">{t.agent}</td>
                  <td className="px-2 py-2 text-xs">{t.state}</td>
                  <td className="px-2 py-2"><DblEdit value={t.level} numeric onSave={v => tierSet(t.agent, 'level', v)}/></td>
                  <td className="px-2 py-2"><DblEdit value={t.position} numeric onSave={v => tierSet(t.agent, 'position', v)}/></td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => tierDel(t.agent)}
                            className="rounded-md border border-edge px-2 py-1 text-xs text-ink-muted hover:bg-red-500/20 hover:text-red-500">✕</button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          )}
        <div className="flex items-center gap-2 border-t border-edge p-3">
          <select value={addAgent} onChange={e => setAddAgent(e.target.value)}
                  className="w-56 rounded-md border border-edge bg-surface-3 px-2 py-1.5 text-sm outline-none">
            <option value="">{t('Додати агента…')}</option>
            {freeAgents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          <label className="text-xs text-ink-faint">level</label>
          <input value={level} onChange={e => setLevel(e.target.value)} className="w-14 rounded-md border border-edge bg-surface-3 px-2 py-1.5 text-sm outline-none"/>
          <label className="text-xs text-ink-faint">position</label>
          <input value={position} onChange={e => setPosition(e.target.value)} className="w-14 rounded-md border border-edge bg-surface-3 px-2 py-1.5 text-sm outline-none"/>
          <button onClick={tierAdd} disabled={!addAgent}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500 disabled:opacity-50">＋</button>
        </div>
      </section>
    </div>
  )
}

// ---------------- shared bits ----------------

function Empty({text}: {text: string}) {
  return <div className="rounded-lg border border-edge bg-surface-2 p-8 text-center text-sm text-ink-faint">{text}</div>
}

function statusColor(status: string): string {
  if (status === 'Available' || status === 'Available (On Demand)') return 'text-green-500'
  if (status === 'On Break') return 'text-amber-500'
  return 'text-ink-muted'
}

function AgentState({state}: {state: string}) {
  const busy = state === 'In a queue call' || state === 'Receiving'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs
      ${busy ? 'bg-sky-500/10 text-sky-500' : 'bg-ink-faint/10 text-ink-muted'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'bg-sky-400' : 'bg-ink-faint'}`}/>
      {state || '—'}
    </span>
  )
}

// DblEdit shows a value as text; double-click turns it into an input.
// Enter/blur saves (if changed), Escape cancels.
function DblEdit({value, onSave, numeric = false}: {value: string; onSave: (v: string) => void; numeric?: boolean}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)

  if (!editing) {
    return (
      <span onDoubleClick={() => { setV(value); setEditing(true) }}
            title={t('Подвійний клік — редагувати')}
            className={`block cursor-text truncate rounded px-1 py-0.5 hover:bg-surface-3 ${numeric ? 'w-14 tabular-nums' : ''}`}>
        {value || '—'}
      </span>
    )
  }

  const cancel = () => { setV(value); setEditing(false) }
  const commit = () => { setEditing(false); if (v !== value) onSave(v) }

  return (
    <input autoFocus value={v} onChange={e => setV(e.target.value)}
           onFocus={e => e.target.select()}
           onBlur={commit}
           onKeyDown={e => {
             if (e.key === 'Enter') commit()
             if (e.key === 'Escape') cancel()
           }}
           className={`rounded-md border border-edge bg-surface-3 px-1 py-0.5 outline-none focus:border-zinc-400
             ${numeric ? 'w-14 tabular-nums' : 'w-full font-mono'}`}/>
  )
}

function fmtSec(s: string): string {
  const n = Number(s) || 0
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60)
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${n}s`
}

function waitTime(joinedEpoch: string): string {
  const j = Number(joinedEpoch) || 0
  if (!j) return '—'
  const s = Math.max(0, Math.floor(Date.now() / 1000 - j))
  const m = Math.floor(s / 60)
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}с`
}
