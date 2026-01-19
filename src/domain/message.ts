export interface SubagentInfo {
  type: string
  description: string
  agentId?: string
  toolCount?: number
}

export interface FileBlock {
  id: string
  content: string
  name: string
  language?: string
  lineCount: number
}

export interface PendingFile {
  id: string
  content: string
  name: string
  language?: string
  lineCount: number
  isReference: boolean
  path?: string
  isDirectory?: boolean
}

export type ToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'awaiting_input'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  status: ToolStatus
  output?: string
  error?: string
  parentToolId?: string
  startedAt?: string
  endedAt?: string
  subagent?: SubagentInfo
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface Message {
  id: string
  role: MessageRole
  text: string
  toolCalls?: ToolCall[]
  isStreaming?: boolean
  timestamp: Date
  fileBlocks?: FileBlock[]
}

export type ParsedMessage = Message
