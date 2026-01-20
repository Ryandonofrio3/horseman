import type { FileBlock, ParsedMessage, SessionUsage, TodoItem, ToolCall } from '@/domain'
import type { Question } from '@/store/types'

/**
 * Pending question detected from transcript (session wasn't live, so no MCP to respond to)
 */
export interface PendingQuestionFromTranscript {
  toolUseId: string
  questions: Question[]
}

/**
 * Normalize tool output content to a string.
 * Claude tool results can be string or object - we always want string for display.
 */
function normalizeOutput(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  return JSON.stringify(content, null, 2)
}

// ============================================================================
// REAL-TIME EVENT PARSING (called once per event as they stream in)
// ============================================================================

export interface ParsedAssistantMessage {
  message: ParsedMessage
  todos: TodoItem[] | null  // Non-null if this message contains a TodoWrite
}

/**
 * Parse an assistant event into a UI-ready message.
 * Called once when the event arrives, not on every render.
 */
export function parseAssistantEvent(
  event: Record<string, unknown>,
  messageId: string
): ParsedAssistantMessage | null {
  const assistantMsg = event as {
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

  const content = assistantMsg.message?.content
  if (!content) return null

  // Extract text content
  const textParts = content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('')

  // Extract tool calls
  const toolCalls: ToolCall[] = content
    .filter((c) => c.type === 'tool_use')
    .map((c) => ({
      id: c.id || crypto.randomUUID(),
      name: c.name || 'unknown',
      input: c.input || {},
      status: 'running' as const,
      startedAt: new Date().toISOString(),
    }))

  // Extract todos from TodoWrite tool calls
  let todos: TodoItem[] | null = null
  for (const tool of toolCalls) {
    if (tool.name === 'TodoWrite' && tool.input.todos) {
      const rawTodos = tool.input.todos as Array<{
        content: string
        status: string
        activeForm: string
      }>
      todos = rawTodos.map((t) => ({
        content: t.content,
        status: t.status as TodoItem['status'],
        activeForm: t.activeForm,
      }))
    }
  }

  const message: ParsedMessage = {
    id: messageId,
    role: 'assistant',
    text: textParts,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    timestamp: new Date(),
  }

  return { message, todos }
}

export interface ToolResultUpdate {
  toolUseId: string
  output: string
}

/**
 * Parse a user event for tool results.
 * Returns tool results to be applied to previous messages.
 */
export function parseUserEventForToolResults(
  event: Record<string, unknown>
): ToolResultUpdate[] {
  const userMsg = event as {
    message?: {
      content?: Array<{
        type: string
        tool_use_id?: string
        content?: unknown  // Can be string or object!
      }>
    }
  }

  const content = userMsg.message?.content
  if (!content) return []

  const results: ToolResultUpdate[] = []

  for (const c of content) {
    if (c.type === 'tool_result' && c.tool_use_id) {
      results.push({
        toolUseId: c.tool_use_id,
        output: normalizeOutput(c.content),
      })
    }
  }

  return results
}

/**
 * Create a user message for display.
 */
export function createUserMessage(
  text: string,
  id?: string,
  fileBlocks?: FileBlock[]
): ParsedMessage {
  return {
    id: id || crypto.randomUUID(),
    role: 'user',
    text,
    timestamp: new Date(),
    fileBlocks,
  }
}

// ============================================================================
// TRANSCRIPT PARSING (for loading saved sessions)
// ============================================================================

export interface TranscriptParseResult {
  messages: ParsedMessage[]
  todos: TodoItem[] | null
  usage: SessionUsage | null
  totalCostUsd: number | null
  pendingQuestion: PendingQuestionFromTranscript | null
}

/**
 * Parse a JSONL transcript file into UI-ready messages.
 * This is used when loading a saved session from disk.
 *
 * Transcripts are stored in ~/.claude/projects/{path}/{session-id}.jsonl
 */
export function parseTranscript(transcriptContent: string): TranscriptParseResult {
  const messages: ParsedMessage[] = []
  const toolResults: Record<string, string> = {}
  let currentTodos: TodoItem[] | null = null
  let lastUserText: string | null = null
  let lastResultEvent: Record<string, unknown> | null = null

  // Track AskUserQuestion tool calls to detect pending questions
  interface AskUserQuestionCall {
    toolUseId: string
    questions: Question[]
  }
  const askUserQuestionCalls: AskUserQuestionCall[] = []

  const lines = transcriptContent.split('\n').filter((line) => line.trim())

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>
      const type = event.type as string

      // Track result events for usage extraction
      if (type === 'result') {
        lastResultEvent = event
        continue
      }

      // Skip non-message types
      if (!type || type === 'queue-operation' || type === 'system') {
        continue
      }

      // User message - could be prompt or tool result
      if (type === 'user') {
        const userMsg = event as {
          message?: {
            content?: string | Array<{
              type: string
              text?: string
              tool_use_id?: string
              content?: unknown
            }>
          }
        }

        const content = userMsg.message?.content

        // Handle string content (older format from Claude CLI)
        if (typeof content === 'string') {
          const trimmed = content.trim()
          if (trimmed) {
            lastUserText = trimmed
          }
        } else if (Array.isArray(content)) {
          // Handle array content (newer format)
          for (const c of content) {
            // User text prompt
            if (c.type === 'text' && c.text) {
              lastUserText = c.text
            }
            // Tool result
            if (c.type === 'tool_result' && c.tool_use_id) {
              toolResults[c.tool_use_id] = normalizeOutput(c.content)
            }
          }
        }
        continue
      }

      // Assistant message
      if (type === 'assistant') {
        // Add the preceding user message if we have one
        if (lastUserText) {
          messages.push(createUserMessage(lastUserText))
          lastUserText = null
        }

        const result = parseAssistantEvent(event, crypto.randomUUID())
        if (result) {
          // Apply any tool results we've seen
          if (result.message.toolCalls) {
            for (const tc of result.message.toolCalls) {
              if (toolResults[tc.id]) {
                tc.output = toolResults[tc.id]
                tc.status = 'completed'
              }

              // Track AskUserQuestion calls
              if (tc.name === 'AskUserQuestion' && tc.input.questions) {
                askUserQuestionCalls.push({
                  toolUseId: tc.id,
                  questions: tc.input.questions as Question[],
                })
              }
            }
          }

          messages.push(result.message)

          // Track todos
          if (result.todos) {
            currentTodos = result.todos
          }
        }
        continue
      }
    } catch {
      // Skip invalid JSON lines
      continue
    }
  }

  // Add any trailing user message that wasn't followed by assistant response
  if (lastUserText) {
    messages.push(createUserMessage(lastUserText))
  }

  // Check for pending AskUserQuestion (called but no result)
  let pendingQuestion: PendingQuestionFromTranscript | null = null
  for (const call of askUserQuestionCalls) {
    if (!toolResults[call.toolUseId]) {
      // This AskUserQuestion never got a result - it's pending
      pendingQuestion = {
        toolUseId: call.toolUseId,
        questions: call.questions,
      }
      // Take the last pending one (most recent)
    }
  }

  // Extract usage from last result event
  let usage: SessionUsage | null = null
  let totalCostUsd: number | null = null

  if (lastResultEvent) {
    const resultUsage = lastResultEvent.usage as Record<string, unknown> | undefined
    const modelUsage = lastResultEvent.modelUsage as Record<string, Record<string, unknown>> | undefined
    totalCostUsd = (lastResultEvent.total_cost_usd as number) ?? null

    // Get contextWindow from first model in modelUsage
    const firstModelUsage = modelUsage ? Object.values(modelUsage)[0] : undefined
    const contextWindow = (firstModelUsage?.contextWindow as number) || 200000

    if (resultUsage) {
      usage = {
        inputTokens: (resultUsage.input_tokens as number) || 0,
        outputTokens: (resultUsage.output_tokens as number) || 0,
        cacheReadTokens: (resultUsage.cache_read_input_tokens as number) || 0,
        cacheCreationTokens: (resultUsage.cache_creation_input_tokens as number) || 0,
        contextWindow,
      }
    }
  }

  return { messages, todos: currentTodos, usage, totalCostUsd, pendingQuestion }
}

