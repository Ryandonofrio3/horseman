import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AppStore, SessionState } from './types'
import type { Session } from '@/domain'
import { createSessionsSlice } from './slices/sessions'
import { createChatSlice } from './slices/chat'
import { createSettingsSlice } from './slices/settings'
import { createPermissionsSlice } from './slices/permissions'
import { createQuestionsSlice } from './slices/questions'
import { createSlashSlice } from './slices/slash'
import { createPlanSlice } from './slices/plan'
import { tauriStorage } from '@/lib/storage'
import { createSessionState } from './helpers'

type PersistedSessions = Record<string, SessionState> | Record<string, Session> | Session[]

function normalizeSession(session: Session, fallbackId: string): Session {
  const id = session.id || fallbackId
  return {
    ...session,
    id,
    // Sessions without isDiscovered were created in Horseman (before we added the field)
    isDiscovered: session.isDiscovered ?? false,
  }
}

function hydrateSessions(raw: PersistedSessions | undefined): Record<string, SessionState> {
  if (!raw) return {}
  const hydrated: Record<string, SessionState> = {}

  if (Array.isArray(raw)) {
    for (const session of raw) {
      const normalized = normalizeSession(session, session.id)
      hydrated[normalized.id] = createSessionState(normalized)
    }
    return hydrated
  }

  for (const [id, value] of Object.entries(raw)) {
    const session = 'session' in value ? value.session : value
    const normalized = normalizeSession(session as Session, id)
    hydrated[normalized.id] = createSessionState(normalized)
  }

  return hydrated
}

function serializeSessions(sessions: Record<string, SessionState>): Record<string, SessionState> {
  const serialized: Record<string, SessionState> = {}
  for (const [id, sessionState] of Object.entries(sessions)) {
    serialized[id] = createSessionState(sessionState.session)
  }
  return serialized
}

export const useStore = create<AppStore>()(
  persist(
    (...args) => ({
      ...createSessionsSlice(...args),
      ...createChatSlice(...args),
      ...createSettingsSlice(...args),
      ...createPermissionsSlice(...args),
      ...createQuestionsSlice(...args),
      ...createSlashSlice(...args),
      ...createPlanSlice(...args),
    }),
    {
      name: 'horseman-state',
      storage: createJSONStorage(() => tauriStorage),
      partialize: (state) => ({
        // Sessions slice (persisted)
        sessions: serializeSessions(state.sessions),
        activeSessionId: state.activeSessionId,
        openTabIds: state.openTabIds,
        hiddenSessionIds: state.hiddenSessionIds,
        // Settings slice (persisted)
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        model: state.model,
        hiddenFolders: state.hiddenFolders,
        sortOrder: state.sortOrder,
        permissionMode: state.permissionMode,
        // NOT persisted: session messages/tool indexes, pendingPermissions, pendingQuestions, slash state, activePlan
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppStore> | undefined
        const hydratedSessions = p?.sessions
          ? hydrateSessions(p.sessions as PersistedSessions)
          : current.sessions
        const openTabIds = p?.openTabIds
          ? p.openTabIds.filter((id) => hydratedSessions[id])
          : current.openTabIds
        const activeSessionId =
          p?.activeSessionId && hydratedSessions[p.activeSessionId]
            ? p.activeSessionId
            : current.activeSessionId
        return {
          ...current,
          ...p,
          sessions: hydratedSessions,
          openTabIds,
          activeSessionId,
        }
      },
    }
  )
)

export type { AppStore } from './types'
