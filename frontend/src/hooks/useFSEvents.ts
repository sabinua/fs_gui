import {useEffect, useRef} from 'react'
import {EventsOn} from '../../wailsjs/runtime/runtime'
import {FSEventPayload} from '../types'

// Subscribes to fs:event pushes for one connection. The handler ref is kept
// current so callers don't have to memoize it.
export function useFSEvents(connId: string, handler: (ev: FSEventPayload) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => EventsOn('fs:event', (ev: FSEventPayload) => {
    if (ev.connId === connId) ref.current(ev)
  }), [connId])
}
