import {useState} from 'react'
import {TransferCall} from '../../wailsjs/go/main/App'
import {useT} from '../i18n'
import type {Call} from './Calls'

interface Props {
  connId: string
  call: Call
  onClose: () => void
}

export default function TransferDialog({connId, call, onClose}: Props) {
  const t = useT()
  const [dest, setDest] = useState('')
  const [leg, setLeg] = useState<'' | '-bleg' | '-both'>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const doTransfer = async () => {
    if (!dest.trim()) return
    setBusy(true)
    setErr('')
    try {
      await TransferCall(connId, call.uuid, dest.trim(), leg, '', '')
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[380px] rounded-xl border border-edge bg-surface-2 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold">{t('Трансфер')}</h2>
        <p className="mb-4 text-sm text-ink-muted">{call.cidNum} → {call.dest}</p>

        <label className="mb-1 block text-xs text-ink-muted">{t('Куди (extension / номер)')}</label>
        <input autoFocus value={dest} onChange={e => setDest(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && doTransfer()}
               placeholder="1001"
               className="mb-3 w-full rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>

        <label className="mb-1 block text-xs text-ink-muted">{t('Кого переводимо')}</label>
        <div className="mb-4 flex gap-1 rounded-md bg-surface-3 p-1 text-sm">
          {([['', 'A-leg (цей канал)'], ['-bleg', 'B-leg (співрозмовник)'], ['-both', 'Обидва']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setLeg(v)}
                    className={`flex-1 rounded px-2 py-1 text-xs ${leg === v ? 'bg-surface text-ink-strong' : 'text-ink-muted hover:text-ink-strong'}`}>
              {t(l)}
            </button>
          ))}
        </div>

        {err && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-3">{t('Скасувати')}</button>
          <button onClick={doTransfer} disabled={busy || !dest.trim()}
                  className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">
            {t('Перевести')}
          </button>
        </div>
      </div>
    </div>
  )
}
