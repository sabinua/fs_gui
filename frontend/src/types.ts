import {store} from '../wailsjs/go/models'

export type Profile = store.Profile

export type SessionState = 'connecting' | 'online' | 'reconnecting' | 'offline'

export interface SessionStatusEvent {
  connId: string
  state: SessionState
  error?: string
}

export interface FSEventPayload {
  connId: string
  name: string
  fields: Record<string, string>
  body?: string
}

export function emptyProfile(): Profile {
  return store.Profile.createFrom({
    id: '',
    name: '',
    color: '#22c55e',
    eslHost: '',
    eslPort: 8021,
    useSsh: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    sshAuth: 'password',
    sshKeyPath: '',
    autoConnect: false,
  })
}

export const stateColors: Record<SessionState, string> = {
  connecting: 'bg-amber-500',
  reconnecting: 'bg-amber-500',
  online: 'bg-green-500',
  offline: 'bg-ink-faint',
}

export const stateLabels: Record<SessionState, string> = {
  connecting: 'Підключення…',
  reconnecting: 'Перепідключення…',
  online: 'Онлайн',
  offline: 'Офлайн',
}
