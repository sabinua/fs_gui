import {useEffect, useState} from 'react'
import {EventsOn} from '../../wailsjs/runtime/runtime'
import {ListPluginStates} from '../../wailsjs/go/main/App'
import {main} from '../../wailsjs/go/models'
import {Profile, SessionState, stateLabels} from '../types'
import {pluginPages} from '../plugins'
import {useT} from '../i18n'
import Dashboard from './Dashboard'
import Calls from './Calls'
import CDR from './CDR'
import Events from './Events'
import Directory from './Directory'
import Tracer from './Tracer'
import Commands from './Commands'

interface Props {
  profile: Profile
  state: SessionState
  lastError?: string
}

const coreViews = [
  {id: 'dashboard', label: 'Дашборд'},
  {id: 'calls', label: 'Дзвінки'},
  {id: 'directory', label: 'Директорія'},
  {id: 'cdr', label: 'CDR'},
  {id: 'events', label: 'Події'},
  {id: 'tracer', label: 'Tracer'},
  {id: 'commands', label: 'Команди'},
]

// One connected server tab: core screens + pages of active plugins.
export default function ServerView({profile, state, lastError}: Props) {
  const t = useT()
  const [view, setView] = useState('dashboard')
  const [plugins, setPlugins] = useState<main.PluginState[]>([])

  useEffect(() => {
    const load = () => ListPluginStates(profile.id).then(setPlugins).catch(() => {})
    load()
    return EventsOn('plugin:state', (ev: {connId: string}) => {
      if (ev.connId === profile.id) load()
    })
  }, [profile.id, state])

  const pluginViews = plugins
    .filter(p => p.active && pluginPages[p.manifest.id])
    .map(p => ({id: `plugin:${p.manifest.id}`, label: pluginPages[p.manifest.id].label}))

  const views = [...coreViews, ...pluginViews]

  // If the active plugin tab disappears (plugin deactivated), fall back.
  useEffect(() => {
    if (!views.some(v => v.id === view)) setView('dashboard')
  }, [views.map(v => v.id).join(','), view])

  const activePlugin = view.startsWith('plugin:') ? view.slice('plugin:'.length) : null
  const PluginPage = activePlugin ? pluginPages[activePlugin]?.component : null

  return (
    <div className="flex h-full flex-col">
      <nav className="flex gap-1 border-b border-edge bg-surface px-4 pt-2">
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
                  className={`rounded-t-md border-b-2 px-3 py-1.5 text-sm
                    ${view === v.id
                      ? 'border-green-500 text-ink-strong'
                      : 'border-transparent text-ink-faint hover:text-ink'}`}>
            {t(v.label)}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'dashboard' && <Dashboard profile={profile} state={state} lastError={lastError}/>}
        {view === 'calls' && requireOnline(t, state, lastError, <Calls connId={profile.id}/>)}
        {view === 'directory' && requireOnline(t, state, lastError, <Directory connId={profile.id}/>)}
        {view === 'cdr' && <CDR connId={profile.id}/>}
        {view === 'events' && <Events connId={profile.id}/>}
        {view === 'tracer' && requireOnline(t, state, lastError, <Tracer connId={profile.id}/>)}
        {view === 'commands' && requireOnline(t, state, lastError, <Commands connId={profile.id}/>)}
        {PluginPage && requireOnline(t, state, lastError, <PluginPage connId={profile.id}/>)}
      </div>
    </div>
  )
}

function requireOnline(t: (k: string) => string, state: SessionState, lastError: string | undefined, node: JSX.Element) {
  if (state === 'online') return node
  return <div className="p-6 text-sm text-ink-faint">{t(stateLabels[state])}{lastError ? ` — ${lastError}` : ''}</div>
}
