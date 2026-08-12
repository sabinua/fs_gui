import {useEffect, useState} from 'react'
import {main} from '../../wailsjs/go/models'
import {CreateProfile, ListPluginStates, SetPluginEnabled, TestConnection, UpdateProfile} from '../../wailsjs/go/main/App'
import {Profile} from '../types'
import {useT} from '../i18n'

interface Props {
  profile: Profile // empty id → create
  onClose: (saved: boolean) => void
}

const inputCls =
  'w-full rounded-md bg-surface-3 border border-edge px-3 py-1.5 text-sm outline-none focus:border-zinc-400'
const labelCls = 'block text-xs text-ink-muted mb-1'

export default function ProfileForm({profile, onClose}: Props) {
  const t = useT()
  const [p, setP] = useState<Profile>({...profile} as Profile)
  const [secrets, setSecrets] = useState({eslPassword: '', sshPassword: '', sshPassphrase: ''})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [testMsg, setTestMsg] = useState<{ok: boolean; text: string} | null>(null)

  const set = (patch: Partial<Profile>) => setP({...p, ...patch} as Profile)
  const isNew = !p.id

  const [plugins, setPlugins] = useState<main.PluginState[]>([])
  useEffect(() => {
    if (!p.id) return
    ListPluginStates(p.id).then(setPlugins).catch(() => {})
  }, [p.id])

  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      await SetPluginEnabled(p.id, pluginId, enabled)
      setPlugins(await ListPluginStates(p.id))
    } catch (e) {
      setError(String(e))
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const sec = main.ProfileSecrets.createFrom(secrets)
      if (isNew) await CreateProfile(p, sec)
      else await UpdateProfile(p, sec)
      onClose(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setTestMsg(null)
    try {
      const r = await TestConnection(p, main.ProfileSecrets.createFrom(secrets))
      if (r.eslOk) setTestMsg({ok: true, text: t('З’єднання успішне (SSH та ESL)')})
      else setTestMsg({ok: false, text: r.detail || t('Не вдалося підключитись')})
    } catch (e) {
      setTestMsg({ok: false, text: String(e)})
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] max-h-[90vh] overflow-y-auto rounded-xl border border-edge bg-surface-2 p-5 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">
          {isNew ? t('Нове підключення') : t('Редагувати: {name}', {name: profile.name})}
        </h2>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>{t('Назва')}</label>
              <input className={inputCls} value={p.name} onChange={e => set({name: e.target.value})} placeholder="PBX Kyiv"/>
            </div>
            <div>
              <label className={labelCls}>{t('Колір')}</label>
              <input type="color" className="h-8 w-12 cursor-pointer rounded-md border border-edge bg-surface-3"
                     value={p.color || '#22c55e'} onChange={e => set({color: e.target.value})}/>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>{t('ESL хост')}</label>
              <input className={inputCls} value={p.eslHost} onChange={e => set({eslHost: e.target.value})} placeholder="127.0.0.1"/>
            </div>
            <div className="w-24">
              <label className={labelCls}>{t('Порт')}</label>
              <input className={inputCls} type="number" value={p.eslPort}
                     onChange={e => set({eslPort: Number(e.target.value)})}/>
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('Пароль ESL')} {!isNew && <span className="text-ink-faint">{t('(порожньо — не змінювати)')}</span>}</label>
            <input className={inputCls} type="password" value={secrets.eslPassword}
                   onChange={e => setSecrets({...secrets, eslPassword: e.target.value})} placeholder="ClueCon"/>
          </div>

          <label className="flex items-center gap-2 pt-1 text-sm">
            <input type="checkbox" checked={p.useSsh} onChange={e => set({useSsh: e.target.checked})}/>
            {t('Підключатись через SSH-тунель')}
          </label>

          {p.useSsh && (
            <div className="space-y-3 rounded-lg border border-edge bg-surface p-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>{t('SSH хост')}</label>
                  <input className={inputCls} value={p.sshHost} onChange={e => set({sshHost: e.target.value})}/>
                </div>
                <div className="w-24">
                  <label className={labelCls}>{t('Порт')}</label>
                  <input className={inputCls} type="number" value={p.sshPort}
                         onChange={e => set({sshPort: Number(e.target.value)})}/>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>{t('Користувач')}</label>
                  <input className={inputCls} value={p.sshUser} onChange={e => set({sshUser: e.target.value})}/>
                </div>
                <div className="flex-1">
                  <label className={labelCls}>{t('Автентифікація')}</label>
                  <select className={inputCls} value={p.sshAuth} onChange={e => set({sshAuth: e.target.value})}>
                    <option value="password">{t('Пароль')}</option>
                    <option value="key">{t('Приватний ключ')}</option>
                    <option value="agent">SSH-agent</option>
                  </select>
                </div>
              </div>
              {p.sshAuth === 'password' && (
                <div>
                  <label className={labelCls}>{t('Пароль SSH')} {!isNew && <span className="text-ink-faint">{t('(порожньо — не змінювати)')}</span>}</label>
                  <input className={inputCls} type="password" value={secrets.sshPassword}
                         onChange={e => setSecrets({...secrets, sshPassword: e.target.value})}/>
                </div>
              )}
              {p.sshAuth === 'key' && (
                <>
                  <div>
                    <label className={labelCls}>{t('Шлях до ключа')}</label>
                    <input className={inputCls} value={p.sshKeyPath} placeholder="~/.ssh/id_ed25519"
                           onChange={e => set({sshKeyPath: e.target.value})}/>
                  </div>
                  <div>
                    <label className={labelCls}>{t('Пароль ключа (якщо є)')}</label>
                    <input className={inputCls} type="password" value={secrets.sshPassphrase}
                           onChange={e => setSecrets({...secrets, sshPassphrase: e.target.value})}/>
                  </div>
                </>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.autoConnect} onChange={e => set({autoConnect: e.target.checked})}/>
            {t('Підключатись автоматично при старті')}
          </label>

          {!isNew && plugins.length > 0 && (
            <div className="rounded-lg border border-edge bg-surface p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('Плагіни')}</div>
              {plugins.map(pl => (
                <label key={pl.manifest.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" checked={pl.enabled}
                         onChange={e => togglePlugin(pl.manifest.id, e.target.checked)}/>
                  <span>{pl.manifest.name}</span>
                  <span className="text-xs text-ink-faint">
                    {pl.active ? t('· активний') : pl.enabled && !pl.available ? '· ' + t('{mods} не завантажено', {mods: pl.manifest.fsModules.join(', ')}) : ''}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {testMsg && (
          <div className={`mt-3 rounded-md px-3 py-2 text-sm ${testMsg.ok ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            {testMsg.text}
          </div>
        )}
        {error && <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}

        <div className="mt-5 flex justify-between">
          <button onClick={test} disabled={busy}
                  className="rounded-md border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-3 disabled:opacity-50">
            {t('Перевірити з’єднання')}
          </button>
          <div className="flex gap-2">
            <button onClick={() => onClose(false)} disabled={busy}
                    className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-3">
              {t('Скасувати')}
            </button>
            <button onClick={save} disabled={busy}
                    className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">
              {t('Зберегти')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
