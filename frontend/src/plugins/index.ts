import {FC} from 'react'
import CallCenter from './CallCenter'

// v1 plugin pages are compiled in; the tab appears only when the backend
// reports the plugin active for the connection (module loaded + enabled).
export const pluginPages: Record<string, {label: string; component: FC<{connId: string}>}> = {
  callcenter: {label: 'Call Center', component: CallCenter},
}
