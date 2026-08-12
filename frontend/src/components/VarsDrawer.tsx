import {useCallback, useEffect, useState} from 'react'
import {GetChannelVars, SetChannelVar} from '../../wailsjs/go/main/App'
import {main} from '../../wailsjs/go/models'
import {useT} from '../i18n'
import type {Call} from './Calls'

interface Props {
  connId: string
  call: Call
  onClose: () => void
}

export default function VarsDrawer({connId, call, onClose}: Props) {
  const t = useT()
  const [dump, setDump] = useState<main.ChannelDump | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('')
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [showFields, setShowFields] = useState(false)

  const reload = useCallback(() => {
    GetChannelVars(connId, call.uuid)
      .then(d => { setDump(d); setErr('') })
      .catch(e => setErr(String(e)))
  }, [connId, call.uuid])

  useEffect(reload, [reload])

  const save = async (key: string, value: string) => {
    try {
      await SetChannelVar(connId, call.uuid, key, value)
      setEditKey(null)
      setNewKey('')
      setNewVal('')
      reload()
    } catch (e) {
      alert(String(e))
    }
  }

  const match = (kv: main.KV) =>
    !filter || kv.key.toLowerCase().includes(filter.toLowerCase()) || kv.value.toLowerCase().includes(filter.toLowerCase())

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-[520px] flex-col border-l border-edge bg-surface-2 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <header className="border-b border-edge px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{t('Змінні каналу')}</h2>
            <button onClick={onClose} className="px-2 text-ink-faint hover:text-ink-strong">×</button>
          </div>
          <div className="select-text font-mono text-xs text-ink-faint">{call.uuid}</div>
        </header>

        <div className="border-b border-edge p-3">
          <input placeholder={t('Фільтр…')} value={filter} onChange={e => setFilter(e.target.value)}
                 className="w-full rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>
        </div>

        {err && <div className="m-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

        <div className="flex-1 overflow-y-auto p-3">
          {dump && (
            <>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {t('Змінні ({n}) — клік по значенню, щоб редагувати', {n: dump.variables.length})}
              </div>
              {dump.variables.filter(match).map(kv => (
                <div key={kv.key} className="group border-b border-edge/40 py-1.5">
                  <div className="select-text font-mono text-xs text-ink-faint">{kv.key}</div>
                  {editKey === kv.key
                    ? (
                      <div className="mt-1 flex gap-1">
                        <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                               onKeyDown={e => {
                                 if (e.key === 'Enter') save(kv.key, editVal)
                                 if (e.key === 'Escape') setEditKey(null)
                               }}
                               className="flex-1 rounded border border-edge bg-surface-3 px-2 py-1 font-mono text-xs outline-none focus:border-zinc-400"/>
                        <button onClick={() => save(kv.key, editVal)}
                                className="rounded bg-green-600 px-2 text-xs text-white hover:bg-green-500">OK</button>
                        <button onClick={() => setEditKey(null)}
                                className="rounded border border-edge px-2 text-xs text-ink-muted">Esc</button>
                      </div>
                    )
                    : (
                      <div onClick={() => { setEditKey(kv.key); setEditVal(kv.value) }}
                           title={t('Клік — редагувати')}
                           className="cursor-pointer select-text break-all font-mono text-sm text-ink-strong hover:text-ink-strong">
                        {kv.value || <span className="text-ink-dim">{t('(порожньо)')}</span>}
                      </div>
                    )}
                </div>
              ))}

              <div className="mt-4 rounded-lg border border-edge bg-surface p-2">
                <div className="mb-1 text-xs text-ink-faint">{t('Додати / встановити змінну')}</div>
                <div className="flex gap-1">
                  <input placeholder={t('назва')} value={newKey} onChange={e => setNewKey(e.target.value)}
                         className="w-40 rounded border border-edge bg-surface-3 px-2 py-1 font-mono text-xs outline-none focus:border-zinc-400"/>
                  <input placeholder={t('значення')} value={newVal} onChange={e => setNewVal(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && newKey.trim() && save(newKey.trim(), newVal)}
                         className="flex-1 rounded border border-edge bg-surface-3 px-2 py-1 font-mono text-xs outline-none focus:border-zinc-400"/>
                  <button onClick={() => newKey.trim() && save(newKey.trim(), newVal)}
                          className="rounded bg-green-600 px-2 text-xs text-white hover:bg-green-500">＋</button>
                </div>
              </div>

              <button onClick={() => setShowFields(!showFields)}
                      className="mt-4 text-xs text-ink-faint hover:text-ink">
                {showFields ? '▾' : '▸'} {t('Службові поля каналу ({n})', {n: dump.fields.length})}
              </button>
              {showFields && dump.fields.filter(match).map(kv => (
                <div key={kv.key} className="border-b border-edge/40 py-1.5">
                  <div className="select-text font-mono text-xs text-ink-faint">{kv.key}</div>
                  <div className="select-text break-all font-mono text-sm text-ink-muted">{kv.value}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
