import type { Message, ToolCall } from './message'
import type { PendingQuestion } from './question'
import type { TodoItem } from './todo'
import type { SessionUsage } from './session'

export type BackendMessage = Omit<Message, 'timestamp'> & { timestamp: string }

export type BackendEvent =
  | { type: 'session.started'; uiSessionId: string; claudeSessionId: string }
  | { type: 'session.ended'; uiSessionId: string; exitCode: number | null; error?: string }
  | { type: 'message.user'; uiSessionId: string; message: BackendMessage }
  | { type: 'message.assistant'; uiSessionId: string; message: BackendMessage }
  | { type: 'message.streaming'; uiSessionId: string; messageId: string; delta: string }
  | { type: 'tool.started'; uiSessionId: string; tool: ToolCall }
  | { type: 'tool.updated'; uiSessionId: string; toolId: string; update: Partial<ToolCall> }
  | { type: 'tool.completed'; uiSessionId: string; toolId: string; output: string }
  | { type: 'tool.error'; uiSessionId: string; toolId: string; error: string }
  | { type: 'todos.updated'; uiSessionId: string; todos: TodoItem[] }
  | { type: 'usage.updated'; uiSessionId: string; usage: SessionUsage }
  | { type: 'permission.requested'; requestId: string; toolName: string; toolInput: Record<string, unknown> }
  | { type: 'permission.resolved'; requestId: string }
  | { type: 'question.requested'; requestId: string; question: PendingQuestion }
  | { type: 'question.resolved'; requestId: string }
  | { type: 'slash.started'; commandId: string }
  | { type: 'slash.output'; commandId: string; data: string }
  | { type: 'slash.detected'; commandId: string; method: string }
  | { type: 'slash.completed'; commandId: string; exitCode: number | null }
  | { type: 'slash.error'; commandId: string; message: string }
