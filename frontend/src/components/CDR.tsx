import {useCallback, useEffect, useState} from 'react'
import {ExportCDRCSV, GetCDRRaw, QueryCDR} from '../../wailsjs/go/main/App'
import {store} from '../../wailsjs/go/models'
import {useFSEvents} from '../hooks/useFSEvents'
import {locale, useT} from '../i18n'

const PAGE = 50

const emptyFilter = {number: '', direction: '', cause: '', from: '', to: ''}

export default function CDR({connId}: {connId: string}) {
  const t = useT()
  const [filter, setFilter] = useState(emptyFilter)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<store.CDRPage | null>(null)
  const [err, setErr] = useState('')
  const [rawFor, setRawFor] = useState<store.CDRRow | null>(null)
  const [exportMsg, setExportMsg] = useState('')

  const buildFilter = useCallback((offset: number) => store.CDRFilter.createFrom({
    number: filter.number.trim(),
    direction: filter.direction,
    cause: filter.cause.trim(),
    fromEpoch: filter.from ? Math.floor(new Date(filter.from).getTime() / 1000) : 0,
    toEpoch: filter.to ? Math.floor(new Date(filter.to).getTime() / 1000) + 86399 : 0,
    limit: PAGE,
    offset,
  }), [filter])

  const load = useCallback((p: number) => {
    QueryCDR(connId, buildFilter(p * PAGE))
      .then(d => { setData(d); setErr('') })
      .catch(e => setErr(String(e)))
  }, [connId, buildFilter])

  useEffect(() => { load(page) }, [load, page])

  // A finished call adds a CDR row — refresh when we're on the first page.
  useFSEvents(connId, ev => {
    if (ev.name === 'CHANNEL_HANGUP_COMPLETE' && page === 0) {
      setTimeout(() => load(0), 300)
    }
  })

  const doExport = async () => {
    try {
      const path = await ExportCDRCSV(connId, buildFilter(0))
      setExportMsg(path ? t('Збережено: {path}', {path}) : '')
    } catch (e) {
      setErr(String(e))
    }
  }

  const pages = data ? Math.ceil(data.total / PAGE) : 0

  const inputCls = 'rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400'

  return (
    <div className="p-6">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-lg font-semibold">CDR</h1>
        {data && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs tabular-nums text-ink-muted">{data.total}</span>}
        <span className="text-xs text-ink-dim">{t('збирається з моменту підключення')}</span>
        <button onClick={doExport}
                className="ml-auto rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3">
          {t('⇩ Експорт CSV')}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-44`} placeholder={t('Номер (від/кому)…')}
               value={filter.number} onChange={e => { setPage(0); setFilter({...filter, number: e.target.value}) }}/>
        <select className={inputCls} value={filter.direction}
                onChange={e => { setPage(0); setFilter({...filter, direction: e.target.value}) }}>
          <option value="">{t('Всі напрямки')}</option>
          <option value="inbound">{t('Вхідні')}</option>
          <option value="outbound">{t('Вихідні')}</option>
        </select>
        <input className={`${inputCls} w-52`} placeholder="Hangup cause (точно)…"
               value={filter.cause} onChange={e => { setPage(0); setFilter({...filter, cause: e.target.value.toUpperCase()}) }}/>
        <input className={inputCls} type="date" value={filter.from}
               onChange={e => { setPage(0); setFilter({...filter, from: e.target.value}) }}/>
        <span className="text-xs text-ink-dim">—</span>
        <input className={inputCls} type="date" value={filter.to}
               onChange={e => { setPage(0); setFilter({...filter, to: e.target.value}) }}/>
        {(filter.number || filter.direction || filter.cause || filter.from || filter.to) && (
          <button onClick={() => { setPage(0); setFilter(emptyFilter) }}
                  className="text-xs text-ink-faint hover:text-ink">{t('✕ скинути')}</button>
        )}
      </div>

      {err && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}
      {exportMsg && <div className="mb-3 select-text rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-500">{exportMsg}</div>}

      {data && (data.rows?.length
          ? (
            <div className="overflow-x-auto rounded-lg border border-edge bg-surface-2">
              <table className="w-full text-sm">
                <thead>
                <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2 font-medium">{t('Початок')}</th>
                  <th className="px-2 py-2 font-medium">{t('Напрямок')}</th>
                  <th className="px-2 py-2 font-medium">{t('Від')}</th>
                  <th className="px-2 py-2 font-medium">{t('Кому')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('Тривалість')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('Розмова')}</th>
                  <th className="px-4 py-2 font-medium">{t('Причина')}</th>
                </tr>
                </thead>
                <tbody>
                {data.rows.map(r => (
                  <tr key={r.id} onClick={() => setRawFor(r)}
                      className="cursor-pointer border-b border-edge/50 last:border-0 hover:bg-surface-3/50">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs tabular-nums">{fmtTime(r.startEpoch)}</td>
                    <td className="px-2 py-2">
                      <span className={r.direction === 'inbound' ? 'text-sky-500' : 'text-violet-500'}>
                        {t(r.direction === 'inbound' ? '→ вх' : '← вих')}
                      </span>
                    </td>
                    <td className="select-text px-2 py-2">{r.cidNum}{r.cidName && r.cidName !== r.cidNum ? ` (${r.cidName})` : ''}</td>
                    <td className="select-text px-2 py-2">{r.dest}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtDur(r.duration)}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtDur(r.billsec)}</td>
                    <td className="px-4 py-2">
                      <CauseBadge cause={r.hangupCause} answered={r.answerEpoch > 0}/>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          )
          : <div className="rounded-lg border border-edge bg-surface-2 p-8 text-center text-sm text-ink-faint">
            {t('Немає записів. CDR пишеться для дзвінків, що завершились після підключення GUI.')}
          </div>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}
                  className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3 disabled:opacity-40">←</button>
          <span className="text-xs tabular-nums text-ink-faint">{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}
                  className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3 disabled:opacity-40">→</button>
        </div>
      )}

      {rawFor && <RawDrawer row={rawFor} onClose={() => setRawFor(null)}/>}
    </div>
  )
}

function fmtTime(epoch: number): string {
  return epoch ? new Date(epoch * 1000).toLocaleString(locale()) : '—'
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function CauseBadge({cause, answered}: {cause: string; answered: boolean}) {
  const ok = cause === 'NORMAL_CLEARING' && answered
  const missed = cause === 'NORMAL_CLEARING' || cause === 'ORIGINATOR_CANCEL' || cause === 'NO_ANSWER'
  const cls = ok ? 'bg-green-500/10 text-green-500'
    : missed ? 'bg-amber-500/10 text-amber-500'
      : 'bg-red-500/10 text-red-500'
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${cls}`}>{cause || '—'}</span>
}

function RawDrawer({row, onClose}: {row: store.CDRRow; onClose: () => void}) {
  const t = useT()
  const [fields, setFields] = useState<[string, string][]>([])
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    GetCDRRaw(row.id)
      .then(raw => {
        const obj = JSON.parse(raw) as Record<string, string>
        setFields(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
      })
      .catch(e => setErr(String(e)))
  }, [row.id])

  const q = filter.toLowerCase()
  const shown = q ? fields.filter(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q)) : fields

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-[520px] flex-col border-l border-edge bg-surface-2 shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="border-b border-edge px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{t('Деталі дзвінка')}</h2>
            <button onClick={onClose} className="px-2 text-ink-faint hover:text-ink-strong">×</button>
          </div>
          <div className="text-sm text-ink-muted">{row.cidNum} → {row.dest} · {fmtTime(row.startEpoch)}</div>
          <div className="select-text font-mono text-xs text-ink-dim">{row.uuid}</div>
        </header>
        <div className="border-b border-edge p-3">
          <input placeholder={t('Фільтр полів…')} value={filter} onChange={e => setFilter(e.target.value)}
                 className="w-full rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {err && <div className="text-sm text-red-500">{err}</div>}
          {shown.map(([k, v]) => (
            <div key={k} className="border-b border-edge/40 py-1.5">
              <div className="select-text font-mono text-xs text-ink-faint">{k}</div>
              <div className="select-text break-all font-mono text-sm text-ink">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
