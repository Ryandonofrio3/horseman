import type { StateCreator } from 'zustand'
import type { AppStore, SessionsSlice } from '../types'
import type { Session, SessionEvent } from '@/domain'
import { createSessionState } from '../helpers'

export const createSessionsSlice: StateCreator<AppStore, [], [], SessionsSlice> = (set) => ({
  sessions: {},
  activeSessionId: null,
  openTabIds: [],
  hiddenSessionIds: [],

  setActiveSession: (id) =>
    set((state) => {
      // When setting active session, also ensure it's in open tabs
      if (id && !state.openTabIds.includes(id)) {
        return { activeSessionId: id, openTabIds: [...state.openTabIds, id] }
      }
      return { activeSessionId: id }
    }),

  addSession: (session: Session) =>
    set((state) => {
      const nextSessions = { ...state.sessions }
      nextSessions[session.id] = createSessionState(session)
      return {
        sessions: nextSessions,
        // Automatically open tab for new session
        openTabIds: [...state.openTabIds, session.id],
      }
    }),

  removeSession: (id: string) =>
    set((state) => {
      if (!state.sessions[id]) return state
      const { [id]: _removed, ...remaining } = state.sessions
      return {
        sessions: remaining,
        openTabIds: state.openTabIds.filter((tabId) => tabId !== id),
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        hiddenSessionIds: state.hiddenSessionIds.includes(id)
          ? state.hiddenSessionIds
          : [...state.hiddenSessionIds, id],
      }
    }),

  updateSession: (id: string, updates: Partial<Session>) =>
    set((state) => {
      const sessionState = state.sessions[id]
      if (!sessionState) return state
      const nextSessions = { ...state.sessions }
      nextSessions[id] = {
        ...sessionState,
        session: { ...sessionState.session, ...updates },
      }
      return { sessions: nextSessions }
    }),

  appendSessionEvent: (id: string, event: SessionEvent) =>
    set((state) => {
      const sessionState = state.sessions[id]
      if (!sessionState) return state
      const existingEvents = sessionState.session.events ?? []
      const nextSessions = { ...state.sessions }
      nextSessions[id] = {
        ...sessionState,
        session: {
          ...sessionState.session,
          events: [...existingEvents, event],
        },
      }
      return { sessions: nextSessions }
    }),

  openTab: (id: string) =>
    set((state) => {
      if (state.openTabIds.includes(id)) {
        return { activeSessionId: id }
      }
      return { openTabIds: [...state.openTabIds, id], activeSessionId: id }
    }),

  closeTab: (id: string) =>
    set((state) => {
      const newOpenTabIds = state.openTabIds.filter((tabId) => tabId !== id)
      // If closing the active tab, switch to another open tab
      let newActiveSessionId = state.activeSessionId
      if (state.activeSessionId === id) {
        const closedIndex = state.openTabIds.indexOf(id)
        if (newOpenTabIds.length > 0) {
          // Switch to adjacent tab (prefer right, then left)
          const newIndex = Math.min(closedIndex, newOpenTabIds.length - 1)
          newActiveSessionId = newOpenTabIds[newIndex]
        } else {
          newActiveSessionId = null
        }
      }
      return { openTabIds: newOpenTabIds, activeSessionId: newActiveSessionId }
    }),
})
