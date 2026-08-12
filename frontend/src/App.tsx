import {useCallback, useEffect, useRef, useState} from 'react'
import {EventsOn} from '../wailsjs/runtime/runtime'
import {CloneProfile, Connect, DeleteProfile, Disconnect, ListProfiles, SessionStates} from '../wailsjs/go/main/App'
import {emptyProfile, Profile, SessionState, SessionStatusEvent, stateColors} from './types'
import {useI18n, useT} from './i18n'
import ProfileForm from './components/ProfileForm'
import ServerView from './components/ServerView'

interface SessionInfo {
  state: SessionState
  error?: string
}

export default function App() {
  const t = useT()
  const {lang, setLang, theme, setTheme} = useI18n()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<Record<string, SessionInfo>>({})
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)

  const refreshProfiles = useCallback(() => {
    ListProfiles().then(setProfiles).catch(console.error)
  }, [])

  useEffect(() => {
    refreshProfiles()
    // Pick up sessions the backend auto-connected at startup.
    SessionStates().then(states => {
      const ids = Object.keys(states)
      if (!ids.length) return
      setSessions(Object.fromEntries(ids.map(id => [id, {state: states[id] as SessionState}])))
      setOpenTabs(ids)
      setActiveTab(ids[0])
    }).catch(console.error)

    return EventsOn('session:status', (ev: SessionStatusEvent) => {
      setSessions(prev => ({...prev, [ev.connId]: {state: ev.state, error: ev.error}}))
    })
  }, [refreshProfiles])

  const openConnection = async (p: Profile) => {
    setOpenTabs(tabs => tabs.includes(p.id) ? tabs : [...tabs, p.id])
    setActiveTab(p.id)
    setSessions(prev => prev[p.id] ? prev : {...prev, [p.id]: {state: 'connecting'}})
    try {
      await Connect(p.id)
    } catch (e) {
      setSessions(prev => ({...prev, [p.id]: {state: 'offline', error: String(e)}}))
    }
  }

  const closeTab = async (id: string) => {
    await Disconnect(id).catch(console.error)
    setOpenTabs(tabs => {
      const next = tabs.filter(t => t !== id)
      setActiveTab(cur => cur === id ? (next[next.length - 1] ?? null) : cur)
      return next
    })
    setSessions(prev => {
      const {[id]: _, ...rest} = prev
      return rest
    })
  }

  const cloneProfile = async (p: Profile) => {
    try {
      const copy = await CloneProfile(p.id)
      refreshProfiles()
      setEditing(copy) // одразу відкриваємо копію — зазвичай міняється лише IP
    } catch (e) {
      alert(String(e))
    }
  }

  const removeProfile = async (p: Profile) => {
    if (!confirm(t('Видалити підключення «{name}»?', {name: p.name}))) return
    await closeTab(p.id)
    await DeleteProfile(p.id).catch(e => alert(String(e)))
    refreshProfiles()
  }

  // Hotkeys: Ctrl+N — new profile, Ctrl+W — close tab, Ctrl+1..9 — switch tab.
  const hotkeyState = useRef({openTabs, activeTab})
  hotkeyState.current = {openTabs, activeTab}
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      const {openTabs, activeTab} = hotkeyState.current
      if (e.key === 'n') {
        e.preventDefault()
        setEditing(emptyProfile())
      } else if (e.key === 'w' && activeTab) {
        e.preventDefault()
        closeTab(activeTab)
      } else if (e.key >= '1' && e.key <= '9') {
        const tab = openTabs[Number(e.key) - 1]
        if (tab) {
          e.preventDefault()
          setActiveTab(tab)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const profileById = (id: string) => profiles.find(p => p.id === id)
  const activeProfile = activeTab ? profileById(activeTab) : undefined

  return (
    <div className="flex h-full">
      {/* Connection manager */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-edge bg-surface-2">
        <div className="flex items-center justify-between px-3 py-3">
          <span className="text-sm font-semibold tracking-wide text-ink">{t('Підключення')}</span>
          <button onClick={() => setEditing(emptyProfile())}
                  title={t('Додати підключення') + ' (Ctrl+N)'}
                  className="rounded-md px-2 py-0.5 text-lg leading-none text-ink-muted hover:bg-surface-3 hover:text-ink-strong">+</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {profiles.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-ink-faint">
              {t('Немає профілів.')}<br/>{t('Натисніть «+», щоб додати FreeSWITCH-сервер.')}
            </div>
          )}
          {profiles.map(p => {
            const sess = sessions[p.id]
            return (
              <div key={p.id}
                   onDoubleClick={() => openConnection(p)}
                   className={`group mb-1 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-3 ${activeTab === p.id ? 'bg-surface-3' : ''}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${sess ? stateColors[sess.state] : 'bg-ink-dim'}`}/>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" style={{color: p.color || undefined}}>{p.name}</div>
                  <div className="truncate text-xs text-ink-faint">
                    {p.useSsh ? `ssh: ${p.sshHost}` : `${p.eslHost}:${p.eslPort}`}
                  </div>
                </div>
                <div className="hidden shrink-0 gap-1 group-hover:flex">
                  {!sess || sess.state === 'offline'
                    ? <IconBtn title={t('Підключити')} onClick={() => openConnection(p)}>▶</IconBtn>
                    : <IconBtn title={t('Відключити')} onClick={() => closeTab(p.id)}>■</IconBtn>}
                  <IconBtn title={t('Редагувати')} onClick={() => setEditing(p)}>✎</IconBtn>
                  <IconBtn title={t('Копіювати')} onClick={() => cloneProfile(p)}>⧉</IconBtn>
                  <IconBtn title={t('Видалити')} onClick={() => removeProfile(p)}>✕</IconBtn>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between border-t border-edge px-3 py-2">
          <span className="text-[11px] text-ink-dim">FS GUI</span>
          <div className="flex gap-1">
            <button onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
                    title="Мова / Language"
                    className="rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase text-ink-muted hover:bg-surface-3 hover:text-ink-strong">
              {lang}
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
                    className="rounded px-1.5 py-0.5 text-[11px] text-ink-muted hover:bg-surface-3 hover:text-ink-strong">
              {theme === 'dark' ? '☀' : '🌙'}
            </button>
          </div>
        </div>
      </aside>

      {/* Tabs + content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 items-end gap-1 border-b border-edge bg-surface-2 px-2">
          {openTabs.map(id => {
            const p = profileById(id)
            const sess = sessions[id]
            if (!p) return null
            return (
              <div key={id}
                   onClick={() => setActiveTab(id)}
                   className={`flex cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 border-edge px-3 py-1.5 text-sm
                     ${activeTab === id ? 'bg-surface text-ink-strong' : 'bg-surface-2 text-ink-muted hover:text-ink-strong'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${sess ? stateColors[sess.state] : 'bg-ink-dim'}`}/>
                <span className="max-w-40 truncate">{p.name}</span>
                <button onClick={e => { e.stopPropagation(); closeTab(id) }}
                        className="text-ink-faint hover:text-ink-strong">×</button>
              </div>
            )
          })}
        </div>

        <div className="min-h-0 flex-1">
          {activeProfile && sessions[activeProfile.id]
            ? <ServerView key={activeProfile.id}
                          profile={activeProfile}
                          state={sessions[activeProfile.id].state}
                          lastError={sessions[activeProfile.id].error}/>
            : (
              <div className="flex h-full items-center justify-center text-sm text-ink-faint">
                {t('Оберіть підключення зліва (подвійний клік) або створіть нове.')}
              </div>
            )}
        </div>
      </main>

      {editing && (
        <ProfileForm profile={editing}
                     onClose={saved => { setEditing(null); if (saved) refreshProfiles() }}/>
      )}
    </div>
  )
}

function IconBtn({title, onClick, children}: {title: string; onClick: () => void; children: string}) {
  return (
    <button title={title}
            onClick={e => { e.stopPropagation(); onClick() }}
            className="rounded px-1 text-xs text-ink-muted hover:bg-surface hover:text-ink-strong">
      {children}
    </button>
  )
}
