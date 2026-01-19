import type { ParsedMessage, PendingPermission, PendingQuestion, PermissionMode, Session, SessionEvent, ToolCall } from '@/domain'
export type { PendingPermission, PendingQuestion, PermissionMode, Question, QuestionOption, SessionEvent } from '@/domain'

export interface SessionState {
  session: Session
  messages: ParsedMessage[]
  toolsById: Record<string, ToolCall>
  toolMessageIds: Record<string, string>
  messageIndexById: Record<string, number>
}

export interface PermissionsSlice {
  pendingPermissions: PendingPermission[]
  addPendingPermission: (permission: PendingPermission) => void
  removePendingPermission: (requestId: string) => void
  clearPendingPermissions: (sessionId: string) => void
  getNextPendingPermission: () => PendingPermission | null
}

export interface QuestionsSlice {
  pendingQuestions: PendingQuestion[]
  addPendingQuestion: (question: PendingQuestion) => void
  removePendingQuestion: (requestId: string) => void
  clearPendingQuestions: (sessionId: string) => void
}

export interface SessionsSlice {
  sessions: Record<string, SessionState>
  activeSessionId: string | null
  openTabIds: string[]  // Session IDs that are open as tabs
  hiddenSessionIds: string[]  // Session IDs hidden from discovered sessions
  setActiveSession: (id: string | null) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  appendSessionEvent: (id: string, event: SessionEvent) => void
  openTab: (id: string) => void
  closeTab: (id: string) => void
}

export interface ChatSlice {
  // Add a complete message (user or parsed assistant)
  addMessage: (sessionId: string, message: ParsedMessage) => void

  // Update an existing message (e.g., when tool result arrives)
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ParsedMessage>) => void

  // Update a specific tool's output within a message
  updateToolOutput: (sessionId: string, messageId: string, toolId: string, output: string) => void

  // Update tool fields (parentToolId, subagent, etc.) with indexed lookup
  updateToolFields: (sessionId: string, toolId: string, updates: Partial<ToolCall>) => void

  // Set all messages for a session (for transcript loading)
  setMessages: (sessionId: string, messages: ParsedMessage[]) => void

  // Merge subagent tools into toolsById (they don't belong to any message)
  mergeSubagentTools: (sessionId: string, tools: ToolCall[]) => void

  // Clear messages for a session
  clearMessages: (sessionId: string) => void

  // Check if session has messages
  hasMessages: (sessionId: string) => boolean
}

export type ModelAlias = 'sonnet' | 'opus' | 'haiku'
export type SortOrder = 'recent' | 'name' | 'status'

export interface SettingsSlice {
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  model: ModelAlias
  hiddenFolders: string[]
  sortOrder: SortOrder
  permissionMode: PermissionMode
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setModel: (model: ModelAlias) => void
  cycleModel: () => void
  hideFolder: (path: string) => void
  unhideFolder: (path: string) => void
  setSortOrder: (order: SortOrder) => void
  setPermissionMode: (mode: PermissionMode) => void
  cyclePermissionMode: () => void
}

export interface SlashState {
  activeCommandId: string | null
  activeCommand: string | null  // 'clear', 'compact', etc.
  isRunning: boolean
  output: string
  error: string | null
  detectionMethod: string | null
}

export interface SlashSlice {
  slash: SlashState
  beginSlashCommand: (command?: string) => void
  startSlashCommand: (commandId: string) => void
  setSlashCommandId: (commandId: string) => void
  appendSlashOutput: (commandId: string, data: string) => void
  setSlashDetectionMethod: (commandId: string, method: string) => void
  endSlashCommand: (commandId: string) => void
  failSlashCommand: (commandId: string | null, message: string) => void
  resetSlashState: () => void
}

export interface ActivePlan {
  sessionId: string
  toolId: string
  content: string
  permissionRequestId: string | null
}

export interface PlanSlice {
  activePlan: ActivePlan | null
  enterPlanMode: (sessionId: string, toolId: string, content: string) => void
  setPlanPermissionId: (requestId: string) => void
  resolvePlan: (action: 'accept' | 'acceptAutoEdits' | 'reject', feedback?: string) => void
  clearPlan: () => void
}

export type AppStore = SessionsSlice & ChatSlice & SettingsSlice & PermissionsSlice & QuestionsSlice & SlashSlice & PlanSlice
