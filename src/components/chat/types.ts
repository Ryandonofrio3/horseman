export type {
  FileBlock,
  Message,
  MessageRole,
  ParsedMessage,
  PendingFile,
  SubagentInfo,
  ToolCall,
  ToolStatus,
} from '@/domain'

// Claude stream event types (used for parsing / debugging)
export interface ClaudeSystemEvent {
  type: 'system'
  model?: string
  session_id?: string
}

export interface ClaudeAssistantEvent {
  type: 'assistant'
  message?: {
    id?: string
    content?: Array<{
      type: string
      text?: string
      id?: string
      name?: string
      input?: Record<string, unknown>
    }>
  }
}

export interface ClaudeUserEvent {
  type: 'user'
  message?: {
    content?: Array<{
      type: string
      tool_use_id?: string
      content?: string
    }>
  }
}

export interface ClaudeResultEvent {
  type: 'result'
  subtype?: string
  total_cost_usd?: number
}

export type ClaudeStreamEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeUserEvent
  | ClaudeResultEvent
  | { type: string; [key: string]: unknown }
