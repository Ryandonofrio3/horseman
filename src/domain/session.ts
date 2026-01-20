import type { TodoItem } from './todo'

export type SessionStatus = 'idle' | 'running' | 'waiting_permission' | 'waiting_question' | 'error'
export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'

// Horseman's event log - context around the conversation that Claude doesn't track
export type SessionEvent =
  | { type: 'compacted'; timestamp: string; summary: string }
  | { type: 'permission'; timestamp: string; tool: string; allowed: boolean; path?: string }
  | { type: 'slash'; timestamp: string; command: string; status: 'completed' | 'error' }

export interface SessionHandle {
  uiId: string
  claudeId: string | null
}

export interface SessionMetadata {
  name: string
  workingDirectory: string
  createdAt: Date
  isDiscovered: boolean
}

export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  contextWindow: number
  cacheWriteTokens?: number
  cost?: number
}

export interface Session {
  id: string
  name: string
  workingDirectory: string
  createdAt: string
  lastActiveAt: string
  status: SessionStatus
  permissionMode: PermissionMode
  totalCostUsd?: number
  claudeSessionId?: string
  isDiscovered?: boolean
  currentTodos?: TodoItem[]
  usage?: SessionUsage
  hasPendingQuestion?: boolean
  events?: SessionEvent[]
  /** Timestamp of the last compaction event for which we injected context */
  lastCompactionInjectedAt?: string
}
