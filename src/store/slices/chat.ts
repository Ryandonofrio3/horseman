import type { StateCreator } from 'zustand'
import type { AppStore, ChatSlice } from '../types'
import type { ParsedMessage, ToolCall } from '@/domain'
import { buildMessageIndexes } from '../helpers'

function findMessageByToolId(messages: ParsedMessage[], toolId: string) {
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]
    if (!message.toolCalls) continue
    if (message.toolCalls.some((tool) => tool.id === toolId)) {
      return { message, index: i }
    }
  }
  return null
}

export const createChatSlice: StateCreator<AppStore, [], [], ChatSlice> = (set, get) => ({
  addMessage: (sessionId: string, message: ParsedMessage) =>
    set((state) => {
      const sessionState = state.sessions[sessionId]
      if (!sessionState) return state

      const nextMessages = [...sessionState.messages, message]
      const nextMessageIndexById = {
        ...sessionState.messageIndexById,
        [message.id]: nextMessages.length - 1,
      }

      let nextToolsById = sessionState.toolsById
      let nextToolMessageIds = sessionState.toolMessageIds

      if (message.toolCalls && message.toolCalls.length > 0) {
        nextToolsById = { ...nextToolsById }
        nextToolMessageIds = { ...nextToolMessageIds }
        for (const tool of message.toolCalls) {
          nextToolsById[tool.id] = tool
          nextToolMessageIds[tool.id] = message.id
        }
      }

      // Update lastActiveAt to the message timestamp for sidebar sorting
      const messageTime = message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : message.timestamp
      const nextSession = {
        ...sessionState.session,
        lastActiveAt: messageTime,
      }

      const nextSessions = { ...state.sessions }
      nextSessions[sessionId] = {
        ...sessionState,
        session: nextSession,
        messages: nextMessages,
        messageIndexById: nextMessageIndexById,
        toolsById: nextToolsById,
        toolMessageIds: nextToolMessageIds,
      }
      return { sessions: nextSessions }
    }),

  updateMessage: (sessionId: string, messageId: string, updates: Partial<ParsedMessage>) =>
    set((state) => {
      const sessionState = state.sessions[sessionId]
      if (!sessionState) return state

      let messageIndex = sessionState.messageIndexById[messageId]
      if (messageIndex == null) {
        messageIndex = sessionState.messages.findIndex((m) => m.id === messageId)
      }
      if (messageIndex === -1 || messageIndex == null) return state

      const message = sessionState.messages[messageIndex]
      const nextMessage = { ...message, ...updates }
      const nextMessages = [...sessionState.messages]
      nextMessages[messageIndex] = nextMessage

      let nextToolsById = sessionState.toolsById
      let nextToolMessageIds = sessionState.toolMessageIds
      let nextMessageIndexById = sessionState.messageIndexById

      if (updates.toolCalls) {
        nextToolsById = { ...nextToolsById }
        nextToolMessageIds = { ...nextToolMessageIds }
        for (const tool of updates.toolCalls) {
          nextToolsById[tool.id] = tool
          nextToolMessageIds[tool.id] = messageId
        }
      }

      if (sessionState.messageIndexById[messageId] == null) {
        nextMessageIndexById = { ...nextMessageIndexById, [messageId]: messageIndex }
      }

      const nextSessions = { ...state.sessions }
      nextSessions[sessionId] = {
        ...sessionState,
        messages: nextMessages,
        messageIndexById: nextMessageIndexById,
        toolsById: nextToolsById,
        toolMessageIds: nextToolMessageIds,
      }
      return { sessions: nextSessions }
    }),

  updateToolOutput: (sessionId: string, _messageId: string, toolId: string, output: string) =>
    set((state) => {
      const sessionState = state.sessions[sessionId]
      if (!sessionState) return state

      const toolMessageId = sessionState.toolMessageIds[toolId]
      let messageIndex =
        toolMessageId != null ? sessionState.messageIndexById[toolMessageId] : undefined

      let message = messageIndex != null ? sessionState.messages[messageIndex] : undefined

      if (!message || !message.toolCalls) {
        const found = findMessageByToolId(sessionState.messages, toolId)
        if (!found) return state
        message = found.message
        messageIndex = found.index
      }

      if (!message.toolCalls) return state

      const nextToolCalls = message.toolCalls.map((tool) =>
        tool.id === toolId
          ? {
              ...tool,
              output,
              status: 'completed' as const,
              endedAt: new Date().toISOString(),
            }
          : tool
      )

      const nextMessage = { ...message, toolCalls: nextToolCalls }
      const nextMessages = [...sessionState.messages]
      nextMessages[messageIndex!] = nextMessage

      const existingTool = sessionState.toolsById[toolId]
      const nextToolsById = {
        ...sessionState.toolsById,
        [toolId]: {
          ...(existingTool ?? { id: toolId, name: 'unknown', input: {}, status: 'completed' }),
          output,
          status: 'completed' as const,
          endedAt: new Date().toISOString(),
        },
      }

      const nextToolMessageIds =
        sessionState.toolMessageIds[toolId] === message.id
          ? sessionState.toolMessageIds
          : { ...sessionState.toolMessageIds, [toolId]: message.id }

      const nextMessageIndexById =
        sessionState.messageIndexById[message.id] != null
          ? sessionState.messageIndexById
          : { ...sessionState.messageIndexById, [message.id]: messageIndex! }

      const nextSessions = { ...state.sessions }
      nextSessions[sessionId] = {
        ...sessionState,
        messages: nextMessages,
        toolsById: nextToolsById,
        toolMessageIds: nextToolMessageIds,
        messageIndexById: nextMessageIndexById,
      }
      return { sessions: nextSessions }
    }),

  updateToolFields: (sessionId: string, toolId: string, updates: Partial<ToolCall>) =>
    set((state) => {
      const sessionState = state.sessions[sessionId]
      if (!sessionState) return state

      const toolMessageId = sessionState.toolMessageIds[toolId]
      let messageIndex =
        toolMessageId != null ? sessionState.messageIndexById[toolMessageId] : undefined
      let message = messageIndex != null ? sessionState.messages[messageIndex] : undefined

      if (!message || !message.toolCalls) {
        const found = findMessageByToolId(sessionState.messages, toolId)
        if (!found) return state
        message = found.message
        messageIndex = found.index
      }

      if (!message.toolCalls) return state

      const nextToolCalls = message.toolCalls.map((tool) =>
        tool.id === toolId ? { ...tool, ...updates } : tool
      )

      const nextMessage = { ...message, toolCalls: nextToolCalls }
      const nextMessages = [...sessionState.messages]
      nextMessages[messageIndex!] = nextMessage

      const existingTool = sessionState.toolsById[toolId]
      const baseTool: ToolCall = existingTool ?? {
        id: toolId,
        name: 'unknown',
        input: {},
        status: 'running',
      }
      const nextToolsById = {
        ...sessionState.toolsById,
        [toolId]: { ...baseTool, ...updates },
      }

      const nextToolMessageIds =
        sessionState.toolMessageIds[toolId] === message.id
          ? sessionState.toolMessageIds
          : { ...sessionState.toolMessageIds, [toolId]: message.id }

      const nextMessageIndexById =
        sessionState.messageIndexById[message.id] != null
          ? sessionState.messageIndexById
          : { ...sessionState.messageIndexById, [message.id]: messageIndex! }

      const nextSessions = { ...state.sessions }
      nextSessions[sessionId] = {
        ...sessionState,
        messages: nextMessages,
        toolsById: nextToolsById,
        toolMessageIds: nextToolMessageIds,
        messageIndexById: nextMessageIndexById,
      }
      return { sessions: nextSessions }
    }),

  setMessages: (sessionId: string, messages: ParsedMessage[]) =>
    set((state) => {
      const sessionState = state.sessions[sessionId]
      if (!sessionState) return state

      const { messageIndexById, toolMessageIds, toolsById } = buildMessageIndexes(messages)

      const nextSessions = { ...state.sessions }
      nextSessions[sessionId] = {
        ...sessionState,
        messages,
        toolsById,
        toolMessageIds,
        messageIndexById,
      }
      return { sessions: nextSessions }
    }),

  /** Merge subagent tools into toolsById (they don't belong to any message) */
  mergeSubagentTools: (sessionId: string, tools: ToolCall[]) =>
    set((state) => {
      const sessionState = state.sessions[sessionId]
      if (!sessionState || tools.length === 0) return state

      const nextToolsById = { ...sessionState.toolsById }
      for (const tool of tools) {
        nextToolsById[tool.id] = tool
      }

      const nextSessions = { ...state.sessions }
      nextSessions[sessionId] = {
        ...sessionState,
        toolsById: nextToolsById,
      }
      return { sessions: nextSessions }
    }),

  clearMessages: (sessionId: string) =>
    set((state) => {
      const sessionState = state.sessions[sessionId]
      if (!sessionState) return state

      const nextSessions = { ...state.sessions }
      nextSessions[sessionId] = {
        ...sessionState,
        messages: [],
        toolsById: {},
        toolMessageIds: {},
        messageIndexById: {},
      }
      return { sessions: nextSessions }
    }),

  hasMessages: (sessionId: string) => {
    const sessionState = get().sessions[sessionId]
    return sessionState ? sessionState.messages.length > 0 : false
  },
})
