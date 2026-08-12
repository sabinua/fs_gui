import {useCallback, useEffect, useState} from 'react'
import {HangupCall, ListChannels, RecordCall} from '../../wailsjs/go/main/App'
import {useFSEvents} from '../hooks/useFSEvents'
import {useT} from '../i18n'
import {FSEventPayload} from '../types'
import TransferDialog from './TransferDialog'
import VarsDrawer from './VarsDrawer'

export interface Call {
  uuid: string
  direction: string
  cidName: string
  cidNum: string
  dest: string
  state: string
  createdMs: number
  app?: string
  recording?: boolean
  otherLeg?: string
}

function fromSnapshot(r: Record<string, string>): Call {
  return {
    uuid: r.uuid,
    direction: r.direction,
    cidName: r.cid_name || '',
    cidNum: r.cid_num || '',
    dest: r.dest || '',
    state: r.callstate || r.state || '',
    createdMs: Number(r.created_epoch || 0) * 1000,
    app: r.application ? `${r.application} ${r.application_data || ''}`.trim() : undefined,
  }
}

export default function Calls({connId}: {connId: string}) {
  const t = useT()
  const [calls, setCalls] = useState<Record<string, Call>>({})
  const [err, setErr] = useState('')
  const [transferFor, setTransferFor] = useState<Call | null>(null)
  const [varsFor, setVarsFor] = useState<Call | null>(null)
  const [, forceTick] = useState(0)

  const reload = useCallback(() => {
    ListChannels(connId)
      .then(rows => {
        setCalls(Object.fromEntries(rows.filter(r => r.uuid).map(r => [r.uuid, fromSnapshot(r)])))
        setErr('')
      })
      .catch(e => setErr(String(e)))
  }, [connId])

  useEffect(reload, [reload])

  // Ticking call duration.
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useFSEvents(connId, (ev: FSEventPayload) => {
    const f = ev.fields
    const uuid = f['Unique-ID']
    if (!uuid) return
    setCalls(prev => {
      switch (ev.name) {
        case 'CHANNEL_CREATE':
          return {
            ...prev,
            [uuid]: {
              uuid,
              direction: f['Call-Direction'] || '',
              cidName: f['Caller-Caller-ID-Name'] || '',
              cidNum: f['Caller-Caller-ID-Number'] || '',
              dest: f['Caller-Destination-Number'] || '',
              state: f['Channel-Call-State'] || 'RINGING',
              createdMs: Number(f['Event-Date-Timestamp'] || 0) / 1000 || Date.now(),
            },
          }
        case 'CHANNEL_ANSWER':
          return prev[uuid] ? {...prev, [uuid]: {...prev[uuid], state: 'ACTIVE'}} : prev
        case 'CHANNEL_BRIDGE':
          return prev[uuid] ? {...prev, [uuid]: {...prev[uuid], otherLeg: f['Other-Leg-Unique-ID']}} : prev
        case 'CHANNEL_EXECUTE':
          return prev[uuid]
            ? {...prev, [uuid]: {...prev[uuid], app: `${f['Application'] || ''} ${f['Application-Data'] || ''}`.trim()}}
            : prev
        case 'CHANNEL_HANGUP_COMPLETE': {
          const {[uuid]: _, ...rest} = prev
          return rest
        }
        case 'RECORD_START':
          return prev[uuid] ? {...prev, [uuid]: {...prev[uuid], recording: true}} : prev
        case 'RECORD_STOP':
          return prev[uuid] ? {...prev, [uuid]: {...prev[uuid], recording: false}} : prev
        default:
          return prev
      }
    })
  })

  const hangup = async (c: Call) => {
    if (!confirm(t('Розірвати дзвінок {from} → {to}?', {from: c.cidNum, to: c.dest}))) return
    try { await HangupCall(connId, c.uuid, '') } catch (e) { alert(String(e)) }
  }

  const toggleRecord = async (c: Call) => {
    try {
      const path = await RecordCall(connId, c.uuid, !c.recording)
      if (path) console.info('recording to', path)
    } catch (e) { alert(String(e)) }
  }

  const list = Object.values(calls).sort((a, b) => a.createdMs - b.createdMs)

  return (
    <div className="p-6">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-lg font-semibold">{t('Дзвінки')}</h1>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs tabular-nums text-ink-muted">{list.length}</span>
        <button onClick={reload} title={t('Оновити знімок')}
                className="ml-auto rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3">
          {t('⟳ Оновити')}
        </button>
      </div>

      {err && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

      {list.length === 0
        ? <div className="rounded-lg border border-edge bg-surface-2 p-8 text-center text-sm text-ink-faint">{t('Немає активних каналів')}</div>
        : (
          <div className="overflow-x-auto rounded-lg border border-edge bg-surface-2">
            <table className="w-full text-sm">
              <thead>
              <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2 font-medium">{t('Тривалість')}</th>
                <th className="px-2 py-2 font-medium">{t('Напрямок')}</th>
                <th className="px-2 py-2 font-medium">{t('Від')}</th>
                <th className="px-2 py-2 font-medium">{t('Кому')}</th>
                <th className="px-2 py-2 font-medium">{t('Стан')}</th>
                <th className="px-2 py-2 font-medium">{t('Додаток')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('Дії')}</th>
              </tr>
              </thead>
              <tbody>
              {list.map(c => (
                <tr key={c.uuid} className="border-b border-edge/50 last:border-0 hover:bg-surface-3/50">
                  <td className="px-4 py-2 font-mono text-xs tabular-nums">{duration(c.createdMs)}</td>
                  <td className="px-2 py-2">
                    <span className={c.direction === 'inbound' ? 'text-sky-500' : 'text-violet-500'}>
                      {t(c.direction === 'inbound' ? '→ вхідний' : '← вихідний')}
                    </span>
                  </td>
                  <td className="select-text px-2 py-2">
                    <div>{c.cidNum}</div>
                    {c.cidName && c.cidName !== c.cidNum && <div className="text-xs text-ink-faint">{c.cidName}</div>}
                  </td>
                  <td className="select-text px-2 py-2">{c.dest}</td>
                  <td className="px-2 py-2">
                    <CallStateBadge state={c.state} recording={c.recording}/>
                  </td>
                  <td className="max-w-48 truncate px-2 py-2 font-mono text-xs text-ink-muted" title={c.app}>{c.app || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <ActionBtn title={t(c.recording ? 'Зупинити запис' : 'Записати')} onClick={() => toggleRecord(c)}
                               active={c.recording}>⏺</ActionBtn>
                    <ActionBtn title={t('Трансфер')} onClick={() => setTransferFor(c)}>⇄</ActionBtn>
                    <ActionBtn title={t('Змінні')} onClick={() => setVarsFor(c)}>⚙</ActionBtn>
                    <ActionBtn title={t('Розірвати')} onClick={() => hangup(c)} danger>✕</ActionBtn>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}

      {transferFor && <TransferDialog connId={connId} call={transferFor} onClose={() => setTransferFor(null)}/>}
      {varsFor && <VarsDrawer connId={connId} call={varsFor} onClose={() => setVarsFor(null)}/>}
    </div>
  )
}

function duration(createdMs: number): string {
  if (!createdMs) return '—'
  const s = Math.max(0, Math.floor((Date.now() - createdMs) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function CallStateBadge({state, recording}: {state: string; recording?: boolean}) {
  const active = state === 'ACTIVE'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs
        ${active ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-amber-500'}`}/>
        {state || '—'}
      </span>
      {recording && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"/> REC
        </span>
      )}
    </span>
  )
}

function ActionBtn({title, onClick, children, danger, active}: {
  title: string; onClick: () => void; children: string; danger?: boolean; active?: boolean
}) {
  return (
    <button title={title} onClick={onClick}
            className={`ml-1 rounded-md border border-edge px-2 py-1 text-xs
              ${active ? 'bg-red-500/20 text-red-500 border-red-500/40'
                : danger ? 'text-ink-muted hover:bg-red-500/20 hover:text-red-500'
                  : 'text-ink-muted hover:bg-surface-3 hover:text-ink-strong'}`}>
      {children}
    </button>
  )
}
