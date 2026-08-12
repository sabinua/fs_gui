import {useCallback, useEffect, useState} from 'react'
import {GetGlobalVars, SetGlobalVar} from '../../wailsjs/go/main/App'
import {main} from '../../wailsjs/go/models'
import {useT} from '../i18n'

// Global variables panel on the dashboard: filterable list, click a value
// to edit it (global_setvar), plus a row to set a new variable.
export default function GlobalVars({connId}: {connId: string}) {
  const t = useT()
  const [vars, setVars] = useState<main.KV[]>([])
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('')
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const reload = useCallback(() => {
    GetGlobalVars(connId)
      .then(v => { setVars(v); setErr('') })
      .catch(e => setErr(String(e)))
  }, [connId])

  useEffect(reload, [reload])

  const save = async (key: string, value: string) => {
    try {
      await SetGlobalVar(connId, key, value)
      setEditKey(null)
      setNewKey('')
      setNewVal('')
      reload()
    } catch (e) {
      alert(String(e))
    }
  }

  const shown = vars.filter(kv =>
    !filter || kv.key.toLowerCase().includes(filter.toLowerCase()) || kv.value.toLowerCase().includes(filter.toLowerCase()))

  return (
    <section className="rounded-lg border border-edge bg-surface-2">
      <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {t('Глобальні змінні ({n})', {n: vars.length})}
        </span>
        <button onClick={reload} className="text-xs text-ink-faint hover:text-ink">⟳ {t('Оновити')}</button>
      </header>

      <div className="border-b border-edge p-2">
        <input placeholder={t('Фільтр…')} value={filter} onChange={e => setFilter(e.target.value)}
               className="w-full rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>
      </div>

      {err && <div className="m-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

      <div className="max-h-80 overflow-y-auto px-4 py-1">
        {shown.map(kv => (
          <div key={kv.key} className="flex items-baseline gap-3 border-b border-edge/40 py-1.5 last:border-0">
            <div className="w-64 shrink-0 select-text break-all font-mono text-xs text-ink-faint">{kv.key}</div>
            {editKey === kv.key
              ? (
                <div className="flex min-w-0 flex-1 gap-1">
                  <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                         onKeyDown={e => {
                           if (e.key === 'Enter') save(kv.key, editVal)
                           if (e.key === 'Escape') setEditKey(null)
                         }}
                         className="min-w-0 flex-1 rounded border border-edge bg-surface-3 px-2 py-1 font-mono text-xs outline-none focus:border-zinc-400"/>
                  <button onClick={() => save(kv.key, editVal)}
                          className="rounded bg-green-600 px-2 text-xs text-white hover:bg-green-500">OK</button>
                  <button onClick={() => setEditKey(null)}
                          className="rounded border border-edge px-2 text-xs text-ink-muted">Esc</button>
                </div>
              )
              : (
                <div onClick={() => { setEditKey(kv.key); setEditVal(kv.value) }}
                     title={t('Клік — редагувати')}
                     className="min-w-0 flex-1 cursor-pointer select-text break-all font-mono text-xs text-ink-strong">
                  {kv.value || <span className="text-ink-dim">{t('(порожньо)')}</span>}
                </div>
              )}
          </div>
        ))}
        {!shown.length && !err && (
          <div className="py-3 text-sm text-ink-faint">{t('Нічого не знайдено')}</div>
        )}
      </div>

      <div className="border-t border-edge p-2">
        <div className="flex gap-1">
          <input placeholder={t('назва')} value={newKey} onChange={e => setNewKey(e.target.value)}
                 className="w-64 rounded border border-edge bg-surface-3 px-2 py-1 font-mono text-xs outline-none focus:border-zinc-400"/>
          <input placeholder={t('значення')} value={newVal} onChange={e => setNewVal(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && newKey.trim() && save(newKey.trim(), newVal)}
                 className="flex-1 rounded border border-edge bg-surface-3 px-2 py-1 font-mono text-xs outline-none focus:border-zinc-400"/>
          <button onClick={() => newKey.trim() && save(newKey.trim(), newVal)}
                  title={t('Додати / встановити змінну')}
                  className="rounded bg-green-600 px-2 text-xs text-white hover:bg-green-500">＋</button>
        </div>
      </div>
    </section>
  )
}
