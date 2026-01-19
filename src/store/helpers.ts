import type { ParsedMessage, Session, ToolCall } from '@/domain'
import type { SessionState } from './types'

interface MessageIndexes {
  messageIndexById: Record<string, number>
  toolMessageIds: Record<string, string>
  toolsById: Record<string, ToolCall>
}

export function buildMessageIndexes(messages: ParsedMessage[]): MessageIndexes {
  const messageIndexById: Record<string, number> = {}
  const toolMessageIds: Record<string, string> = {}
  const toolsById: Record<string, ToolCall> = {}

  messages.forEach((message, index) => {
    messageIndexById[message.id] = index
    if (!message.toolCalls) return
    for (const tool of message.toolCalls) {
      toolsById[tool.id] = tool
      toolMessageIds[tool.id] = message.id
    }
  })

  return { messageIndexById, toolMessageIds, toolsById }
}

export function createSessionState(session: Session, messages: ParsedMessage[] = []): SessionState {
  const { messageIndexById, toolMessageIds, toolsById } = buildMessageIndexes(messages)
  return {
    session,
    messages,
    toolsById,
    toolMessageIds,
    messageIndexById,
  }
}
