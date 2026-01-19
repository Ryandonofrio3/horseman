import { useStore } from '@/store'
import { useActiveSession, useActiveSessionId, useSessions } from '@/store/selectors'

export function useSession() {
  const sessions = useSessions()
  const activeSessionId = useActiveSessionId()
  const activeSession = useActiveSession()
  const setActiveSession = useStore((state) => state.setActiveSession)
  const addSession = useStore((state) => state.addSession)
  const removeSession = useStore((state) => state.removeSession)
  const updateSession = useStore((state) => state.updateSession)

  return {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSession,
    addSession,
    removeSession,
    updateSession,
  }
}
