import {useRef, useState} from 'react'
import {SetEventMonitor} from '../../wailsjs/go/main/App'
import {useFSEvents} from '../hooks/useFSEvents'
import {locale, useT} from '../i18n'
import {FSEventPayload} from '../types'

interface Row {
  seq: number
  at: number
  name: string
  uuid: string
  fields: Record<string, string>
  body?: string
}

const BUFFER = 2000
const SHOWN = 500

export default function Events({connId}: {connId: string}) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [paused, setPaused] = useState(true)
  const [firehose, setFirehose] = useState(false)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const seq = useRef(0)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useFSEvents(connId, (ev: FSEventPayload) => {
    if (pausedRef.current) return
    const row: Row = {
      seq: ++seq.current,
      at: Date.now(),
      name: ev.name,
      uuid: ev.fields['Unique-ID'] || '',
      fields: ev.fields,
      body: ev.body,
    }
    setRows(prev => {
      const next = prev.length >= BUFFER ? prev.slice(prev.length - BUFFER + 1) : prev.slice()
      next.push(row)
      return next
    })
  })

  const toggleFirehose = async () => {
    try {
      await SetEventMonitor(connId, !firehose)
      setFirehose(!firehose)
      setErr('')
    } catch (e) {
      setErr(String(e))
    }
  }

  const q = filter.toLowerCase()
  const shown = (q
      ? rows.filter(r => r.name.toLowerCase().includes(q)
        || r.uuid.includes(q)
        || Object.values(r.fields).some(v => v.toLowerCase().includes(q)))
      : rows
  ).slice(-SHOWN)

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{t('Події')}</h1>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs tabular-nums text-ink-muted">{rows.length}</span>

        <input placeholder={t('Фільтр (назва, uuid, значення)…')} value={filter} onChange={e => setFilter(e.target.value)}
               className="ml-2 w-64 rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted" title="event json ALL">
            <input type="checkbox" checked={firehose} onChange={toggleFirehose}/>
            {t('Всі події')}
          </label>
          <button onClick={() => setPaused(!paused)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${paused
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                    : 'border-edge text-ink-muted hover:bg-surface-3'}`}>
            {paused ? (rows.length === 0 ? t('▶ Почати') : t('▶ Продовжити')) : t('⏸ Пауза')}
          </button>
          <button onClick={() => { setRows([]); setExpanded(null) }}
                  className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3">
            {t('Очистити')}
          </button>
        </div>
      </div>

      {err && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-edge bg-surface-2 font-mono text-xs">
        {shown.length === 0 && (
          <div className="p-8 text-center font-sans text-sm text-ink-faint">
            {paused
              ? t('Потік призупинено — натисніть «Почати», щоб отримувати події.')
              : t('Очікування подій… Базова підписка активна; увімкніть «Всі події» для повного потоку.')}
          </div>
        )}
        {shown.map(r => (
          <div key={r.seq} className="border-b border-edge/40 last:border-0">
            <div onClick={() => setExpanded(expanded === r.seq ? null : r.seq)}
                 className="flex cursor-pointer items-center gap-3 px-3 py-1 hover:bg-surface-3/60">
              <span className="w-20 shrink-0 tabular-nums text-ink-faint">
                {new Date(r.at).toLocaleTimeString(locale())}
              </span>
              <span className="w-64 shrink-0 truncate text-sky-500">{r.name}</span>
              <span className="select-text truncate text-ink-faint">{r.uuid}</span>
            </div>
            {expanded === r.seq && (
              <pre className="select-text max-h-80 overflow-y-auto whitespace-pre-wrap bg-surface px-3 py-2 text-[11px] leading-4 text-ink">
                {JSON.stringify(r.body ? {...r.fields, _body: r.body} : r.fields, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
      {rows.length > SHOWN && !q && (
        <div className="mt-1 text-[11px] text-ink-dim">
          {t('Показані останні {shown}; у буфері {total} (макс {max}).', {shown: SHOWN, total: rows.length, max: BUFFER})}
        </div>
      )}
    </div>
  )
}
