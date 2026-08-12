import {useRef, useState} from 'react'
import {ClipboardSetText} from '../../wailsjs/runtime/runtime'
import {useFSEvents} from '../hooks/useFSEvents'
import {locale, useT} from '../i18n'
import {FSEventPayload} from '../types'

interface Step {
  appUuid: string
  app: string
  data: string
  startUs: number
  durMs?: number
  response?: string
}

interface Trace {
  uuid: string
  number: string
  cidNum: string
  cidName: string
  context: string
  dialplan: string
  channel: string
  startedAt: number
  steps: Step[]
  hangupCause?: string
}

// Dialplan Tracer: arm a destination number, catch the next call(s) to it
// and record every dialplan application executed on that channel.
// Runs entirely on the base event subscription (CHANNEL_CREATE/EXECUTE/
// EXECUTE_COMPLETE/HANGUP_COMPLETE) — no extra load on the server.
export default function Tracer({connId}: {connId: string}) {
  const t = useT()
  const [number, setNumber] = useState('')
  const [armed, setArmed] = useState(false)
  const [traces, setTraces] = useState<Trace[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const armedRef = useRef<{number: string} | null>(null)
  const tracedUuids = useRef<Set<string>>(new Set())

  const arm = () => {
    const n = number.trim()
    if (!n) return
    armedRef.current = {number: n}
    setArmed(true)
  }
  const disarm = () => {
    armedRef.current = null
    setArmed(false)
  }

  useFSEvents(connId, (ev: FSEventPayload) => {
    const f = ev.fields
    const uuid = f['Unique-ID']
    if (!uuid) return

    if (ev.name === 'CHANNEL_CREATE' && armedRef.current
      && f['Caller-Destination-Number'] === armedRef.current.number) {
      tracedUuids.current.add(uuid)
      const trace: Trace = {
        uuid,
        number: f['Caller-Destination-Number'],
        cidNum: f['Caller-Caller-ID-Number'] || '',
        cidName: f['Caller-Caller-ID-Name'] || '',
        context: f['Caller-Context'] || '',
        dialplan: f['Caller-Dialplan'] || '',
        channel: f['Channel-Name'] || '',
        startedAt: Number(f['Event-Date-Timestamp'] || 0) / 1000 || Date.now(),
        steps: [],
      }
      setTraces(prev => [trace, ...prev].slice(0, 20))
      setSelected(uuid)
      return
    }

    if (!tracedUuids.current.has(uuid)) return

    setTraces(prev => prev.map(t => {
      if (t.uuid !== uuid) return t
      switch (ev.name) {
        case 'CHANNEL_EXECUTE':
          return {
            ...t,
            steps: [...t.steps, {
              appUuid: f['Application-UUID'] || String(t.steps.length),
              app: f['Application'] || '',
              data: f['Application-Data'] || '',
              startUs: Number(f['Event-Date-Timestamp'] || 0),
            }],
          }
        case 'CHANNEL_EXECUTE_COMPLETE': {
          const appUuid = f['Application-UUID']
          const endUs = Number(f['Event-Date-Timestamp'] || 0)
          return {
            ...t,
            steps: t.steps.map(st => st.appUuid === appUuid && st.durMs === undefined
              ? {...st, durMs: Math.max(0, Math.round((endUs - st.startUs) / 1000)), response: f['Application-Response'] || ''}
              : st),
          }
        }
        case 'CHANNEL_HANGUP_COMPLETE':
          tracedUuids.current.delete(uuid)
          return {...t, hangupCause: f['Hangup-Cause'] || 'UNKNOWN'}
        default:
          return t
      }
    }))
  })

  const trace = traces.find(t => t.uuid === selected)

  const copyXML = async () => {
    if (!trace) return
    await ClipboardSetText(toExtensionXML(trace))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Dialplan Tracer</h1>
        <input value={number} onChange={e => setNumber(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && (armed ? disarm() : arm())}
               placeholder={t('Номер призначення (точно)…')} disabled={armed}
               className="ml-2 w-56 rounded-md border border-edge bg-surface-3 px-3 py-1.5 font-mono text-sm outline-none focus:border-zinc-400 disabled:opacity-60"/>
        {armed
          ? (
            <button onClick={disarm}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-500 hover:bg-yellow-500/20">
              {t('■ Зупинити очікування')}
            </button>
          )
          : (
            <button onClick={arm} disabled={!number.trim()}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">
              {t('▶ Ловити дзвінок')}
            </button>
          )}
        {armed && (
          <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500"/>
            {t('очікую дзвінок на {n}…', {n: armedRef.current?.number ?? ''})}
          </span>
        )}
      </div>

      {traces.length === 0
        ? (
          <div className="rounded-lg border border-edge bg-surface-2 p-8 text-center text-sm text-ink-faint">
            {t('Вкажіть номер, натисніть «Ловити дзвінок» і зателефонуйте на нього.')}<br/>
            {t('Кожен крок діалплану буде записано з часом виконання.')}
          </div>
        )
        : (
          <div className="flex gap-4">
            <div className="w-72 shrink-0 space-y-2">
              {traces.map(tc => (
                <button key={tc.uuid} onClick={() => setSelected(tc.uuid)}
                        className={`w-full rounded-lg border p-3 text-left hover:bg-surface-3
                          ${selected === tc.uuid ? 'border-green-500/50 bg-surface-3' : 'border-edge bg-surface-2'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{tc.cidNum} → {tc.number}</span>
                    {tc.hangupCause
                      ? <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" title={t('завершено')}/>
                      : <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" title={t('триває')}/>}
                  </div>
                  <div className="mt-1 text-xs text-ink-faint">
                    {new Date(tc.startedAt).toLocaleTimeString(locale())} · {t('кроків: {n}', {n: tc.steps.length})}
                  </div>
                </button>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              {trace && (
                <div className="rounded-lg border border-edge bg-surface-2">
                  <header className="border-b border-edge px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{trace.cidNum}</span>
                        {trace.cidName && trace.cidName !== trace.cidNum && <span className="text-ink-faint"> ({trace.cidName})</span>}
                        <span className="text-ink-faint"> → </span>
                        <span className="font-medium">{trace.number}</span>
                      </div>
                      <button onClick={copyXML}
                              className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3">
                        {copied ? t('✓ Скопійовано') : t('⎘ Копіювати XML-extension')}
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                      <span>context: <span className="select-text font-mono text-ink-muted">{trace.context}</span></span>
                      <span>dialplan: <span className="select-text font-mono text-ink-muted">{trace.dialplan}</span></span>
                      <span className="select-text font-mono">{trace.channel}</span>
                    </div>
                    {trace.hangupCause && (
                      <div className="mt-1 text-xs text-ink-faint">
                        {t('завершено: ')}<span className="font-mono text-ink-muted">{trace.hangupCause}</span>
                      </div>
                    )}
                  </header>

                  {trace.steps.length === 0
                    ? <div className="px-4 py-3 text-sm text-ink-faint">{t('Ще немає виконаних додатків…')}</div>
                    : (
                      <table className="w-full text-sm">
                        <thead>
                        <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-ink-faint">
                          <th className="w-12 px-4 py-2 font-medium">#</th>
                          <th className="w-20 px-2 py-2 text-right font-medium">t, мс</th>
                          <th className="w-40 px-2 py-2 font-medium">Application</th>
                          <th className="px-2 py-2 font-medium">{t('Дані')}</th>
                          <th className="w-24 px-2 py-2 text-right font-medium">{t('Тривалість')}</th>
                          <th className="w-28 px-4 py-2 font-medium">{t('Результат')}</th>
                        </tr>
                        </thead>
                        <tbody>
                        {trace.steps.map((st, i) => {
                          const t0 = trace.steps[0].startUs
                          return (
                            <tr key={st.appUuid + i} className="border-b border-edge/40 last:border-0 hover:bg-surface-3/40">
                              <td className="px-4 py-1.5 text-xs tabular-nums text-ink-faint">{i + 1}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-ink-faint">
                                +{Math.round((st.startUs - t0) / 1000)}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-xs font-medium text-sky-500">{st.app}</td>
                              <td className="max-w-md select-text break-all px-2 py-1.5 font-mono text-xs text-ink">{st.data}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                                {st.durMs !== undefined ? `${st.durMs} мс` : <span className="text-amber-500">…</span>}
                              </td>
                              <td className="select-text px-4 py-1.5 font-mono text-[11px] text-ink-faint">{st.response || ''}</td>
                            </tr>
                          )
                        })}
                        </tbody>
                      </table>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  )
}

function xmlEscape(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// toExtensionXML turns a recorded trace into a dialplan extension skeleton.
function toExtensionXML(t: Trace): string {
  const actions = t.steps
    .map(st => `      <action application="${xmlEscape(st.app)}"${st.data ? ` data="${xmlEscape(st.data)}"` : ''}/>`)
    .join('\n')
  return `<!-- Записано FS GUI ${new Date(t.startedAt).toLocaleString()}
     context=${t.context} · ${t.cidNum} → ${t.number} -->
<extension name="trace_${t.number}">
  <condition field="destination_number" expression="^${escapeRegex(t.number)}$">
${actions}
  </condition>
</extension>`
}
