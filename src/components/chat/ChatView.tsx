import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { FilePill } from './FilePill'
import type { SlashCommandState } from './CompactStatus'
import { ConversationSearch } from './ConversationSearch'
import { PermissionCard } from '@/components/permissions/PermissionCard'
import { AskUserQuestionCard } from '@/components/permissions/AskUserQuestionCard'
import { PlanOverlay } from './PlanOverlay'
import { HelpModal } from '@/components/HelpModal'
import { useConversationSearch } from '@/hooks/useConversationSearch'
import { useSlashCommand } from '@/hooks/useSlashCommand'
import { useSessionPermissions, useSessionQuestions, useSessionEvents, useAllTools } from '@/store/selectors'
import { useStore } from '@/store'
import { MessageSquare, Loader2 } from 'lucide-react'
import type { SlashCommand } from './SlashCommandMenu'
import type { FileBlock, ParsedMessage, PendingFile, SessionEvent, SessionUsage, TodoItem } from '@/domain'

// Simple status line for cleared/compact states
function StatusLine({ children, loading }: { children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
      <div className="w-16 h-px bg-border" />
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      <span>{children}</span>
      <div className="w-16 h-px bg-border" />
    </div>
  )
}

interface ChatViewProps {
  uiSessionId: string        // Horseman's session ID (for store operations)
  claudeSessionId?: string   // Claude's session ID (for PTY commands)
  workingDirectory: string
  messages: ParsedMessage[]
  isWorking: boolean
  error: string | null
  currentTodos?: TodoItem[]
  usage?: SessionUsage
  onSendMessage: (text: string, fileBlocks?: FileBlock[]) => Promise<void>
  onStop: () => Promise<void>
}

export function ChatView({
  uiSessionId,
  claudeSessionId,
  workingDirectory,
  messages,
  isWorking,
  error,
  currentTodos,
  usage,
  onSendMessage,
  onStop,
}: ChatViewProps) {
  const hasMessages = messages.length > 0
  const folderName = workingDirectory?.split('/').pop() || 'your project'

  // Pending files for @ references and pastes
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const hasPendingFiles = pendingFiles.length > 0

  // Help modal state
  const [showHelpModal, setShowHelpModal] = useState(false)

  // Export status (brief feedback)
  const [exportStatus, setExportStatus] = useState<'idle' | 'copied'>('idle')

  // Store actions for /clear and session events
  const clearMessages = useStore((s) => s.clearMessages)
  const updateSession = useStore((s) => s.updateSession)
  const appendSessionEvent = useStore((s) => s.appendSessionEvent)

  // All tools from store (includes subagent tools that aren't in any message)
  const allTools = useAllTools(uiSessionId)

  // Slash command handling (for /compact only - /clear is immediate)
  const { isRunning, activeCommand, error: slashError, runCommand: runSlashCommand } = useSlashCommand()

  // Consolidated command state for /compact and /clear
  interface CommandState {
    type: 'compact' | 'clear' | null
    sessionId: string | null
    completed: boolean
  }
  const [commandState, setCommandState] = useState<CommandState>({
    type: null,
    sessionId: null,
    completed: false,
  })

  // Derive wasCleared from commandState
  const wasCleared = commandState.type === 'clear' && commandState.completed

  // Reset slash state when session changes
  useEffect(() => {
    setCommandState({ type: null, sessionId: null, completed: false })
  }, [claudeSessionId])

  // Clear the "wasCleared" state when messages arrive
  useEffect(() => {
    if (hasMessages && wasCleared) {
      setCommandState(prev => ({ ...prev, type: null, completed: false }))
    }
  }, [hasMessages, wasCleared])

  // Track when compact completes and log session events
  useEffect(() => {
    if (!isRunning && commandState.sessionId === claudeSessionId && commandState.sessionId !== null && activeCommand === 'compact') {
      setCommandState(prev => ({ ...prev, completed: true }))

      // Log session events for the compaction
      const timestamp = new Date().toISOString()
      const status = slashError ? 'error' : 'completed'

      appendSessionEvent(uiSessionId, {
        type: 'slash',
        timestamp,
        command: 'compact',
        status,
      })

      // If successful, also log the compaction point
      if (!slashError) {
        appendSessionEvent(uiSessionId, {
          type: 'compacted',
          timestamp,
          summary: 'Context compacted', // TODO: Extract from transcript
        })
      }
    }
  }, [isRunning, commandState.sessionId, claudeSessionId, activeCommand, slashError, uiSessionId, appendSessionEvent])

  // Derive compact state (only for /compact, not /clear)
  const compactState: SlashCommandState | null = (() => {
    if (isRunning && activeCommand === 'compact' && commandState.sessionId === claudeSessionId) return 'running'
    if (slashError && commandState.sessionId === claudeSessionId) return 'error'
    if (commandState.type === 'compact' && commandState.completed) return 'completed'
    return null
  })()

  const handleRemoveFile = useCallback((id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id))
  }, [])

  const handleSlashCommand = useCallback(async (command: SlashCommand) => {
    // /help doesn't need a session
    if (command.id === 'help') {
      setShowHelpModal(true)
      return
    }

    // /export doesn't need PTY - just format and copy
    if (command.id === 'export') {
      const markdown = messages.map((m) => {
        const role = m.role === 'user' ? '**User**' : '**Assistant**'
        return `${role}\n\n${m.text}`
      }).join('\n\n---\n\n')

      const header = `# Conversation Export\n\nWorking directory: ${workingDirectory}\nExported: ${new Date().toLocaleString()}\n\n---\n\n`

      try {
        await navigator.clipboard.writeText(header + markdown)
        setExportStatus('copied')
        setTimeout(() => setExportStatus('idle'), 2000)
      } catch (err) {
        console.error('Failed to copy to clipboard:', err)
      }
      return
    }

    if (!claudeSessionId) return

    if (command.id === 'clear') {
      // /clear: immediate - clear UI first, run PTY in background
      clearMessages(uiSessionId)
      updateSession(uiSessionId, {
        currentTodos: [],
        usage: usage ? { ...usage, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } : undefined,
      })
      setCommandState({ type: 'clear', sessionId: claudeSessionId, completed: true })

      // Log the slash command event
      appendSessionEvent(uiSessionId, {
        type: 'slash',
        timestamp: new Date().toISOString(),
        command: 'clear',
        status: 'completed',
      })

      // Fire and forget - PTY runs in background to sync with Claude
      runSlashCommand(claudeSessionId, workingDirectory, '/clear', 'clear').catch(() => {})
    } else if (command.id === 'compact') {
      setCommandState({ type: 'compact', sessionId: claudeSessionId, completed: false })
      try {
        await runSlashCommand(claudeSessionId, workingDirectory, '/compact Focus on current task, decisions, and next steps only', 'compact')
      } catch (err) {
        // Error will be captured by hook
      }
    // } else if (command.id === 'init') {
    //   try {
    //     await runSlashCommand(claudeSessionId, workingDirectory, '/init', 'init')
    //   } catch (err) {
    //     // Error will be captured by hook
    //   }
    }
  }, [claudeSessionId, workingDirectory, messages, runSlashCommand, clearMessages, updateSession, uiSessionId, usage, appendSessionEvent])

  // Get permissions and questions scoped to this session
  const pendingPermissions = useSessionPermissions(uiSessionId)
  // Questions: match by toolUseId to tools in this session (MCP caches session ID at spawn, so sessionId field is unreliable)
  const allPendingQuestions = useStore((s) => s.pendingQuestions)
  const toolsById = useStore((s) => s.sessions[uiSessionId]?.toolsById)
  const pendingQuestions = useMemo(() => {
    // Match questions to this session by finding if toolUseId exists in toolsById
    return allPendingQuestions.filter((q) => {
      // If sessionId matches, include it
      if (q.sessionId === uiSessionId) return true
      // If sessionId is "orphan", match by toolUseId to tools in this session
      if (q.sessionId === 'orphan' && toolsById?.[q.toolUseId]) return true
      return false
    })
  }, [allPendingQuestions, uiSessionId, toolsById])
  const nextPermission = pendingPermissions[0] ?? null

  // Get compaction events for rendering dividers in message list
  const sessionEvents = useSessionEvents(uiSessionId)
  const compactionEvents = useMemo(() =>
    sessionEvents.filter(
      (e): e is Extract<SessionEvent, { type: 'compacted' }> => e.type === 'compacted'
    ),
    [sessionEvents]
  )

  // Conversation search
  const {
    isOpen: isSearchOpen,
    searchQuery,
    currentMatch,
    totalMatches,
    currentMatchDetails,
    closeSearch,
    setSearchQuery,
    goToNextMatch,
    goToPrevMatch,
  } = useConversationSearch(messages)

  // Scroll to current match when it changes
  useEffect(() => {
    if (!currentMatchDetails || !isSearchOpen) return

    // Use setTimeout to allow DOM to render the mark elements first
    setTimeout(() => {
      const matchEl = document.querySelector('[data-search-match="current"]')
      if (matchEl) {
        matchEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 0)
  }, [currentMatchDetails, isSearchOpen])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Messages area - scrollable, takes remaining height */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {/* Search overlay */}
        <ConversationSearch
          isOpen={isSearchOpen}
          onClose={closeSearch}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          currentMatch={currentMatch}
          totalMatches={totalMatches}
          onPrevMatch={goToPrevMatch}
          onNextMatch={goToNextMatch}
        />

        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="gap-4 min-h-full">
            {hasMessages ? (
              <>
                <MessageList
                  messages={messages}
                  isWorking={isWorking}
                  workingDirectory={workingDirectory}
                  searchQuery={searchQuery}
                  currentMatchMessageId={currentMatchDetails?.messageId}
                  currentMatchIndexInMessage={currentMatchDetails?.matchIndex}
                  isSearchActive={isSearchOpen}
                  compactionEvents={compactionEvents}
                  allTools={allTools}
                />
                {/* Inline permission requests */}
                {nextPermission && (
                  <PermissionCard
                    key={nextPermission.requestId}
                    permission={nextPermission}
                    queueTotal={pendingPermissions.length}
                  />
                )}
                {/* Inline question requests - show one at a time like permissions */}
                {pendingQuestions[0] && (
                  <AskUserQuestionCard
                    key={pendingQuestions[0].requestId}
                    question={pendingQuestions[0]}
                    queueTotal={pendingQuestions.length}
                  />
                )}
                {/* Inline plan approval */}
                <PlanOverlay />
              </>
            ) : wasCleared ? (
              <div className="flex-1 flex items-center justify-center">
                <StatusLine>Conversation cleared</StatusLine>
              </div>
            ) : (
              <ConversationEmptyState
                className="flex-1"
                title="Start a conversation"
                description={`Ask Claude Code to help with ${folderName}`}
                icon={<MessageSquare className="h-8 w-8" />}
              />
            )}
          </ConversationContent>
          {/* Scroll button - sticky positioning keeps it visible */}
          {hasMessages && <ConversationScrollButton />}
        </Conversation>
      </div>

      {/* Error display - fixed height when present */}
      {error && (
        <div className="shrink-0 mx-4 mb-2 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      {/* Compact status - simple inline line */}
      {compactState && (
        <div className="shrink-0 border-t border-border">
          <StatusLine loading={compactState === 'running'}>
            {compactState === 'running' && 'Context compacting...'}
            {compactState === 'completed' && 'Context compacted'}
            {compactState === 'error' && (slashError || 'Compact failed')}
          </StatusLine>
        </div>
      )}

      {/* Inline todos panel - above input (TodoList handles its own visibility) */}
      <TodoList todos={currentTodos ?? []} />

      {/* Pending files - above input */}
      {hasPendingFiles && (
        <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-2">
          <div className="mx-auto max-w-4xl flex flex-wrap gap-2">
            {pendingFiles.map(file => (
              <FilePill
                key={file.id}
                file={file}
                workingDirectory={workingDirectory}
                onRemove={handleRemoveFile}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input area - fixed height */}
      <footer className="shrink-0 border-t border-border p-4">
        <ChatInput
          sessionId={uiSessionId}
          workingDirectory={workingDirectory}
          isWorking={isWorking || (isRunning && activeCommand === 'compact')}
          usage={usage}
          pendingFiles={pendingFiles}
          setPendingFiles={setPendingFiles}
          onSendMessage={onSendMessage}
          onStop={onStop}
          onSlashCommand={handleSlashCommand}
        />
      </footer>

      {/* Export status toast */}
      {exportStatus === 'copied' && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur border border-border rounded-lg shadow-lg px-4 py-2 z-50">
          <span className="text-sm text-muted-foreground">Conversation copied to clipboard</span>
        </div>
      )}

      {/* Help modal */}
      <HelpModal open={showHelpModal} onOpenChange={setShowHelpModal} />
    </div>
  )
}
