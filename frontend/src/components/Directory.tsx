import {useCallback, useEffect, useMemo, useState} from 'react'
import {FlushRegistration, ListDirectory, ListRegistrations, ListSofiaProfiles} from '../../wailsjs/go/main/App'
import {main} from '../../wailsjs/go/models'
import {locale, useT} from '../i18n'

type User = main.DirectoryUser
type Reg = main.Registration

export default function Directory({connId}: {connId: string}) {
  const t = useT()
  const [users, setUsers] = useState<User[]>([])
  const [regs, setRegs] = useState<Reg[]>([])
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [onlyRegistered, setOnlyRegistered] = useState(false)
  const [selected, setSelected] = useState<User | null>(null)

  const reload = useCallback(() => {
    Promise.all([ListDirectory(connId), ListRegistrations(connId)])
      .then(([u, r]) => { setUsers(u); setRegs(r); setErr('') })
      .catch(e => setErr(String(e)))
  }, [connId])

  useEffect(() => {
    reload()
    const t = setInterval(reload, 15_000)
    return () => clearInterval(t)
  }, [reload])

  const regsByUser = useMemo(() => {
    const m = new Map<string, Reg[]>()
    for (const r of regs) {
      const key = `${r.realm}/${r.user}`
      m.set(key, [...(m.get(key) || []), r])
    }
    return m
  }, [regs])

  const q = search.toLowerCase()
  const shown = users.filter(u =>
    (!onlyRegistered || u.registered) &&
    (!q || u.userId.includes(q) || u.cidName.toLowerCase().includes(q)
      || u.cidNumber.includes(q) || u.groups?.some(g => g.toLowerCase().includes(q))))

  const domains = useMemo(() => {
    const m = new Map<string, User[]>()
    for (const u of shown) m.set(u.domain, [...(m.get(u.domain) || []), u])
    return [...m.entries()]
  }, [shown])

  const registeredCount = users.filter(u => u.registered).length

  return (
    <div className="p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{t('Директорія')}</h1>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs tabular-nums text-ink-muted">
          {users.length} · {t('онлайн {n}', {n: registeredCount})}
        </span>
        <input placeholder={t('Пошук (номер, ім’я, група)…')} value={search} onChange={e => setSearch(e.target.value)}
               className="ml-2 w-64 rounded-md border border-edge bg-surface-3 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"/>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={onlyRegistered} onChange={e => setOnlyRegistered(e.target.checked)}/>
          {t('лише зареєстровані')}
        </label>
        <button onClick={reload}
                className="ml-auto rounded-md border border-edge px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3">
          {t('⟳ Оновити')}
        </button>
      </div>

      {err && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</div>}

      {domains.length === 0 && !err && (
        <div className="rounded-lg border border-edge bg-surface-2 p-8 text-center text-sm text-ink-faint">
          {t('Нічого не знайдено')}
        </div>
      )}

      {domains.map(([domain, list]) => (
        <section key={domain} className="mb-4 rounded-lg border border-edge bg-surface-2">
          <header className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('Домен')}</span>
            <span className="select-text font-mono text-sm">{domain}</span>
            <span className="text-xs text-ink-dim">({list.length})</span>
          </header>
          <table className="w-full text-sm">
            <tbody>
            {list.map(u => (
              <tr key={u.userId} onClick={() => setSelected(u)}
                  className="cursor-pointer border-b border-edge/50 last:border-0 hover:bg-surface-3/50">
                <td className="w-28 px-4 py-2 font-mono font-medium">{u.userId}</td>
                <td className="px-2 py-2">{u.cidName}</td>
                <td className="px-2 py-2 text-xs text-ink-faint">{u.groups?.join(', ')}</td>
                <td className="px-2 py-2 text-xs text-ink-faint">{u.context}</td>
                <td className="w-40 px-4 py-2 text-right">
                  {u.registered
                    ? <Badge color="green">{t('зареєстрований')}</Badge>
                    : <Badge color="zinc">{t('офлайн')}</Badge>}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </section>
      ))}

      {selected && (
        <UserDrawer connId={connId} user={selected}
                    regs={regsByUser.get(`${selected.domain}/${selected.userId}`) || []}
                    onClose={() => setSelected(null)} onChanged={reload}/>
      )}
    </div>
  )
}

function Badge({color, children}: {color: 'green' | 'zinc'; children: string}) {
  const cls = color === 'green' ? 'bg-green-500/10 text-green-500' : 'bg-ink-faint/10 text-ink-faint'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${color === 'green' ? 'bg-green-500' : 'bg-ink-faint'}`}/>
      {children}
    </span>
  )
}

function UserDrawer({connId, user, regs, onClose, onChanged}: {
  connId: string
  user: main.DirectoryUser
  regs: main.Registration[]
  onClose: () => void
  onChanged: () => void
}) {
  const t = useT()
  const [profiles, setProfiles] = useState<string[]>([])
  const [profile, setProfile] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ListSofiaProfiles(connId).then(p => { setProfiles(p); setProfile(p.includes('internal') ? 'internal' : p[0] || '') })
      .catch(() => {})
  }, [connId])

  const flush = async () => {
    if (!profile) return
    if (!confirm(t('Скинути реєстрацію {user}@{domain} (профіль {profile})? Пристрій буде змушений перереєструватись.', {user: user.userId, domain: user.domain, profile}))) return
    try {
      await FlushRegistration(connId, profile, user.userId, user.domain)
      setMsg(t('Реєстрацію скинуто'))
      setTimeout(onChanged, 500)
    } catch (e) {
      setMsg(String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-[480px] flex-col border-l border-edge bg-surface-2 shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="border-b border-edge px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{user.userId}@{user.domain}</h2>
            <button onClick={onClose} className="px-2 text-ink-faint hover:text-ink-strong">×</button>
          </div>
          <div className="text-sm text-ink-muted">{user.cidName} · CID {user.cidNumber}</div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <Field k={t('Контекст')} v={user.context}/>
          <Field k={t('Групи')} v={user.groups?.join(', ') || '—'}/>
          <Field k="Call group" v={user.callGroup || '—'}/>
          <Field k="Contact" v={user.registered ? user.contact : '—'}/>

          <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {t('Реєстрації ({n})', {n: regs.length})}
          </div>
          {regs.length === 0 && <div className="text-sm text-ink-faint">{t('Немає активних реєстрацій')}</div>}
          {regs.map((r, i) => (
            <div key={i} className="mb-2 rounded-lg border border-edge bg-surface p-3 text-sm">
              <Field k="URL" v={r.url}/>
              <Field k={t('Мережа')} v={`${r.networkIp}:${r.networkPort} (${r.networkProto})`}/>
              <Field k={t('Діє до')} v={r.expires ? new Date(r.expires * 1000).toLocaleString(locale()) : '—'}/>
              <Field k={t('Агент (token)')} v={r.token || '—'}/>
              <Field k={t('FS-хост')} v={r.hostname || '—'}/>
            </div>
          ))}

          {user.registered && (
            <div className="mt-5 rounded-lg border border-edge bg-surface p-3">
              <div className="mb-2 text-xs text-ink-faint">{t('Скинути реєстрацію (flush_inbound_reg)')}</div>
              <div className="flex gap-2">
                <select value={profile} onChange={e => setProfile(e.target.value)}
                        className="flex-1 rounded-md border border-edge bg-surface-3 px-2 py-1.5 text-sm outline-none">
                  {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={flush}
                        className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/20">
                  {t('Скинути')}
                </button>
              </div>
            </div>
          )}
          {msg && <div className="mt-3 rounded-md bg-surface-3 px-3 py-2 text-sm text-ink">{msg}</div>}
        </div>
      </div>
    </div>
  )
}

function Field({k, v}: {k: string; v: string}) {
  return (
    <div className="mb-1.5">
      <span className="text-xs text-ink-faint">{k}: </span>
      <span className="select-text break-all font-mono text-xs text-ink">{v}</span>
    </div>
  )
}
