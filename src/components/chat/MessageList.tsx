import { useState, useMemo } from 'react'
import {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { ToolDisplay } from './ToolDisplay'
import { FileBlockDisplay } from './FileBlockDisplay'
import { HighlightableContent } from './HighlightableContent'
import { FileRefDisplay, extractFileRefs } from './InlineFileRef'
import { highlightSearchMatches } from '@/lib/search-utils'
import type { ParsedMessage, SessionEvent, ToolCall } from '@/domain'
import { Copy, Check, Minimize2 } from 'lucide-react'

// Extract compaction event type for props
type CompactionEvent = Extract<SessionEvent, { type: 'compacted' }>

interface MessageListProps {
  messages: ParsedMessage[]
  isWorking: boolean
  workingDirectory?: string
  searchQuery?: string
  currentMatchMessageId?: string
  currentMatchIndexInMessage?: number
  isSearchActive?: boolean
  compactionEvents?: CompactionEvent[]
  /** All tools from store (includes subagent tools that aren't in any message) */
  allTools?: ToolCall[]
}

// Copy button component
function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <MessageAction tooltip={copied ? 'Copied!' : 'Copy'} onClick={handleCopy}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </MessageAction>
  )
}

// System message divider
function SystemDivider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground">{text}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// Compaction divider - shows where Claude's context was reset
function CompactionDivider({ summary }: { summary: string }) {
  return (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className="flex-1 h-px bg-amber-500/30" />
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
        <Minimize2 className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{summary}</span>
      </div>
      <div className="flex-1 h-px bg-amber-500/30" />
    </div>
  )
}

// Typing indicator for when Claude is thinking
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 rounded-full bg-current animate-bounce" />
      </div>
      <span className="text-xs ml-1">Claude is thinking...</span>
    </div>
  )
}

export function MessageList({
  messages,
  isWorking,
  workingDirectory,
  searchQuery = '',
  currentMatchMessageId,
  currentMatchIndexInMessage,
  isSearchActive = false,
  compactionEvents = [],
  allTools: allToolsProp,
}: MessageListProps) {
  // Check if we should show typing indicator
  const lastMessage = messages[messages.length - 1]
  const lastMessageId = lastMessage?.id
  const showTypingIndicator = isWorking && (!lastMessage || lastMessage.role === 'user')

  // Use provided allTools (from store, includes subagent tools) or fallback to flatMap
  // Early return when prop provided to skip unnecessary flatMap computation
  const allTools = useMemo(() => {
    if (allToolsProp) return allToolsProp
    return messages.flatMap((m) => m.toolCalls || [])
  }, [messages, allToolsProp])
  const hasRunningTask = useMemo(
    () => allTools.some(
      (tool) => tool.name === 'Task' && (tool.status === 'pending' || tool.status === 'running')
    ),
    [allTools]
  )

  // Filter messages - memoized to avoid recalculation on unrelated re-renders
  const visibleMessages = useMemo(() =>
    messages.filter((message) => {
      if (message.role === 'system') return true
      const hasText = !!message.text?.trim()
      const hasFileBlocks = (message.fileBlocks?.length ?? 0) > 0
      const messageTools = message.toolCalls || []
      const topLevelTools = messageTools.filter((tool) => {
        if (tool.parentToolId) return false
        if (hasRunningTask && tool.name !== 'Task') return false
        return true
      })
      const hasTools = topLevelTools.length > 0
      return hasText || hasTools || hasFileBlocks
    }),
    [messages, hasRunningTask]
  )

  // Track which compaction events we've already rendered
  const renderedCompactions = new Set<string>()

  return (
    <>
      {visibleMessages.map((message, index) => {
        // Check against original array's last message for streaming indicator
        const isLastMessage = message.id === lastMessageId

        // Handle system messages as dividers
        if (message.role === 'system') {
          return <SystemDivider key={message.id} text={message.text} />
        }

        // Find compaction events that should appear before this message
        const prevMessage = index > 0 ? visibleMessages[index - 1] : null
        const prevTimestamp = prevMessage?.timestamp ? new Date(prevMessage.timestamp).getTime() : 0
        const currTimestamp = message.timestamp ? new Date(message.timestamp).getTime() : Infinity

        const compactionsBeforeThis = compactionEvents.filter((c) => {
          if (renderedCompactions.has(c.timestamp)) return false
          const compactTime = new Date(c.timestamp).getTime()
          return compactTime > prevTimestamp && compactTime <= currTimestamp
        })

        const hasText = !!message.text?.trim()
        const hasFileBlocks = (message.fileBlocks?.length ?? 0) > 0
        const topLevelTools = (message.toolCalls || []).filter((tool) => {
          if (tool.parentToolId) return false
          if (hasRunningTask && tool.name !== 'Task') return false
          return true
        })
        const hasTools = topLevelTools.length > 0
        const isMessageStreaming = message.isStreaming && isLastMessage && isWorking
        const isMessageWithCurrentMatch = currentMatchMessageId === message.id

        // For user messages, extract @file refs
        const { cleanText, filePaths } = message.role === 'user'
          ? extractFileRefs(message.text)
          : { cleanText: message.text, filePaths: [] }

        const hasCleanText = !!cleanText?.trim()
        const hasFileRefs = filePaths.length > 0

        // Mark compactions as rendered
        compactionsBeforeThis.forEach((c) => renderedCompactions.add(c.timestamp))

        return (
          <div key={message.id} data-message-id={message.id}>
            {/* Compaction dividers - rendered before message */}
            {compactionsBeforeThis.map((c) => (
              <CompactionDivider key={c.timestamp} summary={c.summary} />
            ))}

            {/* File blocks for user messages - shown before text */}
            {hasFileBlocks && message.role === 'user' && (
              <div className="space-y-2 mb-2 max-w-[80%] ml-auto">
                {message.fileBlocks!.map(file => (
                  <FileBlockDisplay key={file.id} file={file} />
                ))}
              </div>
            )}

            {/* @file references for user messages - shown before text */}
            {hasFileRefs && message.role === 'user' && (
              <div className="space-y-2 mb-2 max-w-[80%] ml-auto">
                {filePaths.map((path, i) => (
                  <FileRefDisplay
                    key={`${message.id}-ref-${i}`}
                    path={path}
                    workingDirectory={workingDirectory}
                  />
                ))}
              </div>
            )}

            {/* Message bubble - only show if there's text content */}
            {(hasCleanText || (hasText && message.role !== 'user')) && (
              <Message from={message.role}>
                <MessageContent>
                  {message.role === 'user' ? (
                    // User messages: plain text with search highlighting
                    <div className="whitespace-pre-wrap">
                      {highlightSearchMatches(
                        cleanText,
                        searchQuery,
                        isMessageWithCurrentMatch,
                        isSearchActive,
                        currentMatchIndexInMessage
                      )}
                    </div>
                  ) : (
                    // Assistant messages: markdown with DOM-based highlighting
                    <HighlightableContent
                      content={message.text}
                      searchQuery={searchQuery}
                      isMessageWithCurrentMatch={isMessageWithCurrentMatch}
                      isSearchActive={isSearchActive}
                      currentMatchIndexInMessage={currentMatchIndexInMessage}
                    />
                  )}
                  {isMessageStreaming && (
                    <Shimmer className="mt-1">...</Shimmer>
                  )}
                </MessageContent>
                {/* Copy action - show on hover */}
                {!isMessageStreaming && (
                  <MessageActions
                    className={`opacity-0 group-hover:opacity-100 transition-opacity mt-1 ${
                      message.role === 'user' ? 'ml-auto' : ''
                    }`}
                  >
                    <CopyButton content={message.text} />
                  </MessageActions>
                )}
              </Message>
            )}

            {/* Tool uses - rendered outside the message bubble */}
            {/* Only show top-level tools (those without parentToolId) */}
            {hasTools && (
              <div className="space-y-2 mt-2">
                {topLevelTools.map((tool) => (
                  <ToolDisplay
                    key={tool.id}
                    tool={tool}
                    isStreaming={isWorking}
                    allTools={allTools}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Trailing compaction dividers (happened after last message) */}
      {compactionEvents
        .filter((c) => !renderedCompactions.has(c.timestamp))
        .map((c) => (
          <CompactionDivider key={c.timestamp} summary={c.summary} />
        ))}

      {/* Show typing indicator when waiting for first response */}
      {showTypingIndicator && (
        <Message from="assistant">
          <MessageContent>
            <TypingIndicator />
          </MessageContent>
        </Message>
      )}
    </>
  )
}
