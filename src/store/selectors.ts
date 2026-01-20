import { useMemo } from 'react'
import { useStore } from './index'
import { useShallow } from 'zustand/shallow'
import type { ParsedMessage, PendingPermission, PendingQuestion, Session, SessionEvent, SessionStatus, TodoItem, ToolCall } from '@/domain'

/** Status values that require user attention */
export const ATTENTION_STATUSES: SessionStatus[] = ['waiting_permission', 'waiting_question', 'error']

export function needsAttention(status: SessionStatus): boolean {
  return ATTENTION_STATUSES.includes(status)
}

const EMPTY_MESSAGES: ParsedMessage[] = []
const EMPTY_SESSIONS: Session[] = []
const EMPTY_TODOS: TodoItem[] = []
const EMPTY_EVENTS: SessionEvent[] = []
const EMPTY_TOOLS: ToolCall[] = []
const EMPTY_PERMISSIONS: PendingPermission[] = []
const EMPTY_QUESTIONS: PendingQuestion[] = []

export function useSessions() {
  const sessions = useStore(useShallow((s) => s.sessions))
  return useMemo(() => {
    const list = Object.values(sessions).map((state) => state.session)
    return list.length > 0 ? list : EMPTY_SESSIONS
  }, [sessions])
}

export function useActiveSessionId() {
  return useStore((s) => s.activeSessionId)
}

export function useSessionById(sessionId: string | null) {
  return useStore((s) => (sessionId ? s.sessions[sessionId]?.session ?? null : null))
}

export function useActiveSession() {
  const activeSessionId = useActiveSessionId()
  return useSessionById(activeSessionId)
}

export function useSessionMessages(sessionId: string | null) {
  return useStore((s) =>
    sessionId ? (s.sessions[sessionId]?.messages ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  )
}

export function useSessionTodos(sessionId: string | null) {
  return useStore((s) =>
    sessionId ? s.sessions[sessionId]?.session.currentTodos ?? EMPTY_TODOS : EMPTY_TODOS
  )
}

export function usePendingPermissions() {
  return useStore((s) => s.pendingPermissions)
}

export function usePendingQuestions() {
  return useStore((s) => s.pendingQuestions)
}

/** Returns permissions filtered to a specific session */
export function useSessionPermissions(sessionId: string | null) {
  const allPermissions = useStore((s) => s.pendingPermissions)
  return useMemo(() => {
    if (!sessionId) return EMPTY_PERMISSIONS
    const filtered = allPermissions.filter((p) => p.sessionId === sessionId)
    return filtered.length > 0 ? filtered : EMPTY_PERMISSIONS
  }, [allPermissions, sessionId])
}

/** Returns questions filtered to a specific session */
export function useSessionQuestions(sessionId: string | null) {
  const allQuestions = useStore((s) => s.pendingQuestions)
  return useMemo(() => {
    if (!sessionId) return EMPTY_QUESTIONS
    const filtered = allQuestions.filter((q) => q.sessionId === sessionId)
    return filtered.length > 0 ? filtered : EMPTY_QUESTIONS
  }, [allQuestions, sessionId])
}

export function useToolById(sessionId: string | null, toolId: string) {
  return useStore((s) => (sessionId ? s.sessions[sessionId]?.toolsById[toolId] ?? null : null))
}

export function usePermissionMode() {
  return useStore((s) => s.permissionMode)
}

export function useActivePlan() {
  return useStore((s) => s.activePlan)
}

export function useSessionEvents(sessionId: string | null) {
  return useStore((s) =>
    sessionId ? s.sessions[sessionId]?.session.events ?? EMPTY_EVENTS : EMPTY_EVENTS
  )
}

/** Returns all tools for a session (from messages + subagent transcripts) */
export function useAllTools(sessionId: string | null) {
  const toolsById = useStore((s) =>
    sessionId ? s.sessions[sessionId]?.toolsById : undefined
  )
  return useMemo(() => {
    if (!toolsById) return EMPTY_TOOLS
    const tools = Object.values(toolsById)
    return tools.length > 0 ? tools : EMPTY_TOOLS
  }, [toolsById])
}

/** Returns the draft text for a session */
export function useDraft(sessionId: string | null) {
  return useStore((s) => (sessionId ? s.drafts[sessionId] ?? '' : ''))
}

/** Returns user messages for input history navigation (most recent first) */
export function useUserMessages(sessionId: string | null) {
  const messages = useStore((s) =>
    sessionId ? s.sessions[sessionId]?.messages ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  )
  return useMemo(() => {
    const userMsgs = messages.filter((m) => m.role === 'user')
    // Return newest first for Up arrow navigation
    return userMsgs.reverse()
  }, [messages])
}
