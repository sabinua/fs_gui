import {useEffect, useMemo, useRef, useState} from 'react'
import {
  DeleteUserMacro, ListDirectory, ListModules, ListSofiaProfiles, ListUserMacros, SaveUserMacro, SendAPI, SendBgAPI,
} from '../../wailsjs/go/main/App'
import {store} from '../../wailsjs/go/models'
import {useFSEvents} from '../hooks/useFSEvents'
import {useT} from '../i18n'

type Vals = Record<string, string>

interface Suggestions {
  endpoints: string[] // user/1000@domain + шаблони sofia/loopback
  profiles: string[]  // sofia-профілі
  modules: string[]   // завантажені модулі
  contexts: string[]  // контексти діалплану з директорії
}

interface Field {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  options?: string[]                        // фіксований select
  suggest?: (s: Suggestions) => string[]    // джерело автопідказок
  hints?: string[]                          // статичні підказки
  def?: string
  help?: string
  checkbox?: boolean
  full?: boolean                            // на всю ширину форми
  showIf?: (v: Vals) => boolean
}

interface Macro {
  id: string
  label: string
  help: string
  fields: Field[]
  build: (v: Vals) => string
  bg?: boolean                              // виконувати через bgapi
  confirm?: (v: Vals) => string | null      // текст підтвердження для небезпечних дій
}

const FSCTL_NOARG = ['sync_clock', 'sync_clock_when_idle', 'send_sighup', 'flush_db_handles', 'reclaim_mem']
const LOG_LEVELS = ['console', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']
const HUP_CAUSES = ['NORMAL_CLEARING', 'MANAGER_REQUEST', 'SYSTEM_SHUTDOWN', 'CALL_REJECTED', 'REQUESTED_CHAN_UNAVAIL']

const macros: Macro[] = [
  {
    id: 'originate',
    label: 'originate',
    help: 'Створити вихідний дзвінок: A-leg набирається першим, після відповіді з’єднується з призначенням.',
    bg: true,
    fields: [
      {
        key: 'aleg', label: 'Канал (A-leg)', required: true, full: true,
        placeholder: 'user/1000  ·  sofia/gateway/gw1/380441234567  ·  loopback/3000',
        suggest: s => s.endpoints,
      },
      {
        key: 'dest', label: 'Призначення (extension або &app)', required: true, full: true,
        placeholder: '3000  або  &park()',
        hints: ['&park()', '&echo()', '&playback(local_stream://moh)', '&bridge(user/1001)', '&hangup()'],
        help: 'Номер у діалплані або одразу застосунок через &app(args).',
      },
      {key: 'dialplan', label: 'Діалплан', options: ['xml', 'inline'], def: 'xml'},
      {key: 'context', label: 'Контекст', def: 'default', suggest: s => s.contexts},
      {key: 'cidName', label: 'Caller ID (ім’я)', placeholder: 'Outbound Call'},
      {key: 'cidNum', label: 'Caller ID (номер)', placeholder: '0000000000'},
      {key: 'timeout', label: 'Таймаут, с', placeholder: '30'},
      {
        key: 'vars', label: 'Змінні каналу', full: true,
        placeholder: 'ignore_early_media=true,absolute_codec_string=PCMA',
        help: 'key=value через кому — підставляються у {…} перед URL каналу.',
      },
    ],
    build: v => {
      const vars: string[] = []
      if (v.timeout) vars.push(`originate_timeout=${v.timeout}`)
      if (v.cidName) vars.push(`origination_caller_id_name='${v.cidName}'`)
      if (v.cidNum) vars.push(`origination_caller_id_number=${v.cidNum}`)
      if (v.vars) vars.push(v.vars)
      const prefix = vars.length ? `{${vars.join(',')}}` : ''
      return `originate ${prefix}${v.aleg} ${v.dest} ${v.dialplan || 'xml'} ${v.context || 'default'}`
    },
  },
  {
    id: 'fsctl',
    label: 'fsctl',
    help: 'Керування ядром FreeSWITCH на льоту.',
    fields: [
      {
        key: 'sub', label: 'Підкоманда', required: true, def: 'loglevel',
        options: ['loglevel', 'debug_level', 'hupall', 'pause', 'resume', 'max_sessions', 'sps',
          'min_dtmf_duration', ...FSCTL_NOARG, 'shutdown'],
      },
      {key: 'loglevel', label: 'Рівень логів', options: LOG_LEVELS, def: 'info', showIf: v => v.sub === 'loglevel'},
      {
        key: 'debug', label: 'Рівень (0–10)', placeholder: '0',
        showIf: v => v.sub === 'debug_level',
      },
      {
        key: 'cause', label: 'Причина (hangup cause)', options: HUP_CAUSES, def: 'MANAGER_REQUEST',
        showIf: v => v.sub === 'hupall',
      },
      {
        key: 'hupVar', label: 'Лише канали зі змінною (опційно)', placeholder: 'назва змінної',
        showIf: v => v.sub === 'hupall',
      },
      {
        key: 'hupVal', label: 'Значення змінної', placeholder: 'значення',
        showIf: v => v.sub === 'hupall' && !!v.hupVar,
      },
      {
        key: 'dir', label: 'Напрямок', options: ['', 'inbound', 'outbound'],
        help: 'Порожньо — обидва напрямки.',
        showIf: v => v.sub === 'pause' || v.sub === 'resume',
      },
      {key: 'num', label: 'Значення', placeholder: '1000', showIf: v => v.sub === 'max_sessions' || v.sub === 'sps'},
      {key: 'ms', label: 'Мілісекунди', placeholder: '50', showIf: v => v.sub === 'min_dtmf_duration'},
      {
        key: 'mode', label: 'Режим', options: ['elegant', 'asap', 'restart', 'cancel'], def: 'elegant',
        showIf: v => v.sub === 'shutdown',
      },
    ],
    build: v => {
      switch (v.sub) {
        case 'loglevel': return `fsctl loglevel ${v.loglevel || 'info'}`
        case 'debug_level': return `fsctl debug_level ${v.debug || '0'}`
        case 'hupall': {
          let cmd = `fsctl hupall ${v.cause || 'MANAGER_REQUEST'}`
          if (v.hupVar) cmd += ` ${v.hupVar} ${v.hupVal || ''}`
          return cmd.trimEnd()
        }
        case 'pause': case 'resume': return `fsctl ${v.sub}${v.dir ? ' ' + v.dir : ''}`
        case 'max_sessions': return `fsctl max_sessions ${v.num || ''}`.trimEnd()
        case 'sps': return `fsctl sps ${v.num || ''}`.trimEnd()
        case 'min_dtmf_duration': return `fsctl min_dtmf_duration ${v.ms || ''}`.trimEnd()
        case 'shutdown': return `fsctl shutdown ${v.mode || 'elegant'}`
        default: return `fsctl ${v.sub || ''}`.trimEnd()
      }
    },
    confirm: v => {
      if (v.sub === 'shutdown' && v.mode !== 'cancel') return 'Зупинити FreeSWITCH ({mode})? Це перерве всі дзвінки та з’єднання.'
      if (v.sub === 'hupall') return 'Розірвати ВСІ активні дзвінки?'
      return null
    },
  },
  {
    id: 'sofia',
    label: 'sofia profile',
    help: 'Керування SIP-профілем mod_sofia.',
    fields: [
      {key: 'profile', label: 'Профіль', required: true, placeholder: 'internal', suggest: s => s.profiles},
      {key: 'action', label: 'Дія', options: ['start', 'stop', 'restart', 'rescan'], def: 'rescan'},
      {
        key: 'reloadxml', label: 'Спочатку reloadxml', checkbox: true,
        help: 'Перечитати XML-конфіг перед виконанням дії.',
      },
    ],
    build: v => `sofia profile ${v.profile} ${v.action || 'rescan'}${v.reloadxml ? ' reloadxml' : ''}`,
    confirm: v => (v.action === 'stop' || v.action === 'restart')
      ? 'Профіль {profile} буде зупинено — активні дзвінки через нього розірвуться. Продовжити?'
      : null,
  },
  {
    id: 'reload',
    label: 'reload',
    help: 'Перезавантажити модуль без рестарту FreeSWITCH.',
    fields: [
      {key: 'module', label: 'Модуль', required: true, placeholder: 'mod_callcenter', suggest: s => s.modules},
    ],
    build: v => `reload ${v.module}`,
  },
  {
    id: 'raw',
    label: 'API…',
    help: 'Довільна API-команда (як у fs_cli).',
    fields: [
      {
        key: 'cmd', label: 'Команда', required: true, full: true, placeholder: 'status',
        hints: ['status', 'sofia status', 'show channels', 'show calls', 'show registrations',
          'reloadxml', 'reloadacl', 'xml_locate directory', 'uptime'],
      },
    ],
    build: v => v.cmd,
  },
]

// ---- Користувацькі макроси ----
// Плейсхолдери в шаблоні (як у документації FreeSWITCH):
//   <name>          — текстове поле (обов'язкове)
//   <name=default>  — текстове поле зі значенням за замовчуванням
//   <name:a|b|c>    — select, перший варіант — за замовчуванням
// Фігурні дужки не чіпаємо — вони лишаються для {vars} в originate.
const PLACEHOLDER_RE = /<([a-zA-Z_]\w*)(?::([^<>]+)|=([^<>]*))?>/g

interface TplField {
  key: string
  def?: string
  options?: string[]
}

export function parseTemplate(tpl: string): TplField[] {
  const fields: TplField[] = []
  const seen = new Set<string>()
  for (const m of tpl.matchAll(PLACEHOLDER_RE)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    if (m[2] !== undefined) {
      const opts = m[2].split('|')
      fields.push({key: m[1], options: opts, def: opts[0]})
    } else {
      fields.push({key: m[1], def: m[3]})
    }
  }
  return fields
}

export function buildTemplate(tpl: string, vals: Vals): string {
  return tpl
    .replace(PLACEHOLDER_RE, (_, name) => vals[name] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Поля з упізнаваними назвами отримують серверні автопідказки.
const SUGGEST_BY_KEY: Record<string, (s: Suggestions) => string[]> = {
  profile: s => s.profiles,
  module: s => s.modules,
  context: s => s.contexts,
  user: s => s.endpoints,
  endpoint: s => s.endpoints,
  aleg: s => s.endpoints,
}

function toMacro(um: store.Macro): Macro {
  return {
    id: `user:${um.id}`,
    label: um.name,
    help: um.help,
    fields: parseTemplate(um.template).map(f => ({
      key: f.key,
      label: f.key,
      def: f.def,
      options: f.options,
      required: f.def === undefined && !f.options,
      suggest: SUGGEST_BY_KEY[f.key.toLowerCase()],
    })),
    build: v => buildTemplate(um.template, v),
    bg: um.bg,
    confirm: um.confirm ? () => 'Виконати макрос «{name}»?' : undefined,
  }
}

interface LogEntry {
  id: number
  cmd: string
  out: string
  pending: boolean
  isErr: boolean
  jobUuid?: string
  ts: string
}

let logSeq = 0

export default function Commands({connId}: {connId: string}) {
  const t = useT()
  const [macroId, setMacroId] = useState('originate')
  const [vals, setVals] = useState<Vals>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [sugg, setSugg] = useState<Suggestions>({endpoints: [], profiles: [], modules: [], contexts: []})
  const [userMacros, setUserMacros] = useState<store.Macro[]>([])
  const [editing, setEditing] = useState<store.Macro | null>(null)

  const allMacros = useMemo(() => [...macros, ...userMacros.map(toMacro)], [userMacros])
  const macro = allMacros.find(m => m.id === macroId) ?? macros[0]

  const reloadMacros = () => ListUserMacros().then(setUserMacros).catch(() => {})
  useEffect(() => { reloadMacros() }, [])

  // Довантажуємо дані для автопідказок; помилки не критичні.
  useEffect(() => {
    ListDirectory(connId).then(users => {
      const endpoints = users.map(u => `user/${u.userId}@${u.domain}`)
      endpoints.push('loopback/', 'sofia/gateway/', 'sofia/internal/')
      const contexts = [...new Set(users.map(u => u.context).filter(Boolean))]
      setSugg(s => ({...s, endpoints, contexts}))
    }).catch(() => {})
    ListSofiaProfiles(connId).then(profiles => setSugg(s => ({...s, profiles}))).catch(() => {})
    ListModules(connId).then(mods => setSugg(s => ({...s, modules: mods.map(m => m.name)}))).catch(() => {})
  }, [connId])

  // Результати bgapi (originate) приходять подією BACKGROUND_JOB.
  useFSEvents(connId, ev => {
    if (ev.name !== 'BACKGROUND_JOB') return
    const uuid = ev.fields['Job-UUID']
    setLog(prev => prev.map(e => e.jobUuid === uuid && e.pending
      ? {...e, pending: false, out: (ev.body || '').trim(), isErr: (ev.body || '').trim().startsWith('-ERR')}
      : e))
  })

  // При зміні макроса — скинути значення на дефолтні.
  const selectMacro = (m: Macro) => {
    setMacroId(m.id)
    const next: Vals = {}
    for (const f of m.fields) if (f.def) next[f.key] = f.def
    setVals(next)
  }
  useEffect(() => { selectMacro(macros[0]) }, [connId])

  const saveMacro = async (m: store.Macro) => {
    const saved = await SaveUserMacro(m) // помилку показує редактор
    setEditing(null)
    await reloadMacros()
    selectMacro(toMacro(saved))
  }

  const removeMacro = async (m: store.Macro) => {
    if (!window.confirm(t('Видалити макрос «{name}»?', {name: m.name}))) return
    try {
      await DeleteUserMacro(m.id)
    } catch (e) {
      alert(String(e))
      return
    }
    setEditing(null)
    reloadMacros()
    if (macroId === `user:${m.id}`) selectMacro(macros[0])
  }

  const visibleFields = macro.fields.filter(f => !f.showIf || f.showIf(vals))
  const missing = visibleFields.filter(f => f.required && !(vals[f.key] || '').trim())
  const command = useMemo(() => macro.build(vals).trim(), [macro, vals])

  const run = async () => {
    if (missing.length || running) return
    const confirmMsg = macro.confirm?.(vals)
    if (confirmMsg && !window.confirm(t(confirmMsg, {...vals, name: macro.label}))) return

    const id = ++logSeq
    const ts = new Date().toLocaleTimeString()
    setRunning(true)
    try {
      if (macro.bg) {
        const jobUuid = await SendBgAPI(connId, command)
        setLog(prev => [{id, cmd: command, out: '', pending: true, isErr: false, jobUuid, ts}, ...prev])
      } else {
        const out = await SendAPI(connId, command)
        setLog(prev => [{id, cmd: command, out: out.trim(), pending: false, isErr: out.trim().startsWith('-ERR'), ts}, ...prev])
      }
    } catch (e) {
      setLog(prev => [{id, cmd: command, out: String(e), pending: false, isErr: true, ts}, ...prev])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Список макросів */}
      <nav className="flex w-52 shrink-0 flex-col border-r border-edge p-3">
        <div className="space-y-1">
          {macros.map(m => (
            <button key={m.id} onClick={() => selectMacro(m)}
                    className={`block w-full rounded-md px-3 py-1.5 text-left font-mono text-sm
                      ${m.id === macroId ? 'bg-surface-3 text-ink-strong' : 'text-ink-faint hover:bg-surface-2 hover:text-ink'}`}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="mb-1 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-ink-dim">
          {t('Мої макроси')}
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {userMacros.map(um => (
            <div key={um.id} className={`group flex items-center rounded-md
                   ${macroId === `user:${um.id}` ? 'bg-surface-3' : 'hover:bg-surface-2'}`}>
              <button onClick={() => selectMacro(toMacro(um))}
                      className={`min-w-0 flex-1 truncate px-3 py-1.5 text-left font-mono text-sm
                        ${macroId === `user:${um.id}` ? 'text-ink-strong' : 'text-ink-faint group-hover:text-ink'}`}>
                {um.name}
              </button>
              <button onClick={() => setEditing(um)} title={t('Редагувати')}
                      className="px-2 text-xs text-ink-dim opacity-0 hover:text-ink group-hover:opacity-100">✎</button>
            </div>
          ))}
        </div>
        <button onClick={() => setEditing(store.Macro.createFrom({id: '', name: '', help: '', template: '', bg: false, confirm: false}))}
                className="mt-2 rounded-md border border-dashed border-edge px-3 py-1.5 text-left text-sm text-ink-faint hover:bg-surface-2 hover:text-ink">
          {t('+ Створити макрос')}
        </button>
      </nav>

      <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-6">
        <div>
          <h1 className="font-mono text-lg font-semibold">{macro.label}</h1>
          <p className="text-sm text-ink-faint">{t(macro.help)}</p>
        </div>

        {/* Форма */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-edge bg-surface-2 p-4">
          {visibleFields.map(f => (
            <label key={f.key} className={`block text-sm ${f.full ? 'col-span-2' : ''}`}>
              <span className="mb-1 block text-xs text-ink-faint">
                {t(f.label)}{f.required && <span className="text-red-400"> *</span>}
              </span>
              {f.checkbox
                ? (
                  <span className="flex h-8 items-center">
                    <input type="checkbox" checked={!!vals[f.key]}
                           onChange={e => setVals({...vals, [f.key]: e.target.checked ? '1' : ''})}
                           className="h-4 w-4 accent-green-600"/>
                  </span>
                )
                : f.options
                  ? (
                    <select value={vals[f.key] ?? f.def ?? ''}
                            onChange={e => setVals({...vals, [f.key]: e.target.value})}
                            className="w-full rounded-md border border-edge bg-surface-3 px-2 py-1.5 font-mono text-sm outline-none focus:border-zinc-400">
                      {f.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                    </select>
                  )
                  : (
                    <SuggestInput value={vals[f.key] ?? ''} onChange={v => setVals({...vals, [f.key]: v})}
                                  suggestions={[...(f.suggest?.(sugg) ?? []), ...(f.hints ?? [])]}
                                  placeholder={f.placeholder} onEnter={run}/>
                  )}
              {f.help && <span className="mt-1 block text-[11px] text-ink-dim">{t(f.help)}</span>}
            </label>
          ))}
        </div>

        {/* Прев'ю та запуск */}
        <div className="flex items-stretch gap-2">
          <code className="min-w-0 flex-1 select-text overflow-x-auto whitespace-nowrap rounded-md border border-edge bg-surface px-3 py-2 font-mono text-sm text-ink-strong">
            {command || <span className="text-ink-dim">{t('Заповніть форму — команда з’явиться тут')}</span>}
          </code>
          <button onClick={() => navigator.clipboard.writeText(command)} disabled={!command}
                  title={t('Копіювати команду')}
                  className="rounded-md border border-edge px-3 text-sm text-ink-muted hover:bg-surface-2 disabled:opacity-40">⎘</button>
          <button onClick={run} disabled={!!missing.length || running}
                  className="rounded-md bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-40">
            {running ? '…' : t('▶ Виконати')}
          </button>
        </div>
        {!!missing.length && (
          <div className="text-xs text-ink-dim">{t('Заповніть обов’язкові поля: {fields}', {fields: missing.map(f => t(f.label)).join(', ')})}</div>
        )}

        {/* Журнал */}
        {log.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('Журнал ({n})', {n: log.length})}</span>
              <button onClick={() => setLog([])} className="text-xs text-ink-faint hover:text-ink">{t('Очистити')}</button>
            </div>
            {log.map(e => (
              <div key={e.id} className="rounded-lg border border-edge bg-surface-2">
                <div className="flex items-baseline gap-2 border-b border-edge/50 px-3 py-1.5">
                  <span className="text-[11px] text-ink-dim">{e.ts}</span>
                  <code className="min-w-0 flex-1 select-text truncate font-mono text-xs text-ink-muted">{e.cmd}</code>
                  {e.pending && <span className="text-[11px] text-amber-500">{t('виконується…')}</span>}
                </div>
                {!e.pending && (
                  <pre className={`max-h-64 select-text overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs
                    ${e.isErr ? 'text-red-400' : 'text-ink-strong'}`}>
                    {e.out || <span className="text-ink-dim">{t('(порожня відповідь)')}</span>}
                  </pre>
                )}
              </div>
            ))}
          </section>
        )}
      </div>

      {editing && (
        <MacroEditor initial={editing} onClose={() => setEditing(null)} onSave={saveMacro}
                     onDelete={editing.id ? () => removeMacro(editing) : undefined}/>
      )}
    </div>
  )
}

// Редактор користувацького макроса: шаблон з плейсхолдерами + прапорці.
function MacroEditor({initial, onSave, onDelete, onClose}: {
  initial: store.Macro
  onSave: (m: store.Macro) => Promise<void>
  onDelete?: () => void
  onClose: () => void
}) {
  const t = useT()
  const [name, setName] = useState(initial.name)
  const [help, setHelp] = useState(initial.help)
  const [template, setTemplate] = useState(initial.template)
  const [bg, setBg] = useState(initial.bg)
  const [confirm, setConfirm] = useState(initial.confirm)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const fields = useMemo(() => parseTemplate(template), [template])
  const canSave = !!name.trim() && !!template.trim() && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(store.Macro.createFrom({
        id: initial.id, name: name.trim(), help: help.trim(), template: template.trim(), bg, confirm,
      }))
    } catch (e) {
      setErr(String(e))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[560px] rounded-xl border border-edge bg-surface-2 p-4 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {initial.id ? t('Редагувати: {name}', {name: initial.name}) : t('Новий макрос')}
          </h2>
          <button onClick={onClose} className="px-2 text-ink-faint hover:text-ink-strong">×</button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-faint">{t('Назва')}<span className="text-red-400"> *</span></span>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
                   className="w-full rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-faint">{t('Опис')}</span>
            <input value={help} onChange={e => setHelp(e.target.value)}
                   className="w-full rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-faint">{t('Шаблон команди')}<span className="text-red-400"> *</span></span>
            <textarea value={template} onChange={e => setTemplate(e.target.value)} rows={2} spellCheck={false}
                      placeholder="uuid_kill <uuid> <cause=NORMAL_CLEARING>"
                      className="w-full resize-y rounded-md border border-edge bg-surface-3 px-3 py-1.5 font-mono text-sm outline-none focus:border-zinc-400"/>
            <span className="mt-1 block text-[11px] leading-relaxed text-ink-dim">
              {t('<поле> — обов’язкове · <поле=значення> — з дефолтом · <поле:a|b|c> — вибір зі списку. Фігурні дужки {…} лишаються в команді як є.')}
            </span>
          </label>

          <div className="rounded-md border border-edge bg-surface px-3 py-2">
            <div className="mb-1 text-xs text-ink-faint">{t('Поля форми ({n})', {n: fields.length})}</div>
            {fields.length
              ? (
                <div className="flex flex-wrap gap-1.5">
                  {fields.map(f => (
                    <span key={f.key} className="rounded bg-surface-3 px-2 py-0.5 font-mono text-xs text-ink-muted">
                      {f.key}
                      {f.options ? `: ${f.options.join('|')}` : f.def !== undefined ? ` = ${f.def || '""'}` : ' *'}
                    </span>
                  ))}
                </div>
              )
              : <div className="text-xs text-ink-dim">{t('немає — команда виконається як є')}</div>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bg} onChange={e => setBg(e.target.checked)} className="h-4 w-4 accent-green-600"/>
            {t('Виконувати у фоні (bgapi)')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} className="h-4 w-4 accent-green-600"/>
            {t('Питати підтвердження перед виконанням')}
          </label>

          {err && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

          <div className="flex items-center justify-between pt-1">
            {onDelete
              ? <button onClick={onDelete} className="text-sm text-red-400 hover:text-red-300">{t('Видалити')}</button>
              : <span/>}
            <div className="flex gap-2">
              <button onClick={onClose}
                      className="rounded-md border border-edge px-4 py-1.5 text-sm text-ink-muted hover:bg-surface-3">
                {t('Скасувати')}
              </button>
              <button onClick={save} disabled={!canSave}
                      className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-40">
                {t('Зберегти')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Текстове поле з випадаючими автопідказками (фільтр по входженню,
// навігація стрілками, Enter — вибрати, Esc — закрити).
function SuggestInput({value, onChange, suggestions, placeholder, onEnter}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  onEnter?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const shown = useMemo(() => {
    const q = value.toLowerCase()
    const list = q ? suggestions.filter(s => s.toLowerCase().includes(q) && s !== value) : suggestions
    return list.slice(0, 8)
  }, [value, suggestions])

  const pick = (s: string) => {
    onChange(s)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input value={value} placeholder={placeholder}
             onChange={e => { onChange(e.target.value); setOpen(true); setHi(0) }}
             onFocus={() => setOpen(true)}
             onBlur={() => setOpen(false)}
             onKeyDown={e => {
               if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, shown.length - 1)) }
               else if (e.key === 'ArrowUp' && shown.length) { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
               else if (e.key === 'Enter') {
                 if (open && shown.length) { e.preventDefault(); pick(shown[hi]) }
                 else onEnter?.()
               }
               else if (e.key === 'Escape') setOpen(false)
             }}
             className="w-full rounded-md border border-edge bg-surface-3 px-2 py-1.5 font-mono text-sm outline-none focus:border-zinc-400"/>
      {open && shown.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-edge bg-surface-3 py-1 shadow-xl">
          {shown.map((s, i) => (
            <div key={s}
                 onMouseDown={e => { e.preventDefault(); pick(s) }}
                 onMouseEnter={() => setHi(i)}
                 className={`cursor-pointer px-2 py-1 font-mono text-xs ${i === hi ? 'bg-surface-2 text-ink-strong' : 'text-ink-muted'}`}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
