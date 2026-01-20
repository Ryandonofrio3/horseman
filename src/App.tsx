import { useState, useEffect, useCallback } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { nanoid } from 'nanoid'
import { useHorsemanEvents } from '@/hooks/useHorsemanEvents'
import { useStore } from '@/store'
import {
  useActiveSession,
  useActiveSessionId,
  useHasRunningTools,
  useSessionMessages,
  useSessionEvents,
  useSessions,
} from '@/store/selectors'
import { ipc, DiscoveredSession, TranscriptMessage } from '@/lib/ipc'
import type { FileBlock, Message, Session } from '@/domain'
import { AppLayout, Sidebar, TabBar } from '@/components/layout'
import { ChatView } from '@/components/chat'
import { MessageSquare } from 'lucide-react'

// Empty state when no session is selected
function EmptyState({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-4">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-lg">No session selected</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Create a new session to start chatting with Claude Code
        </p>
      </div>
      <button
        onClick={onNewSession}
        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        New Session
      </button>
    </div>
  )
}

function App() {
  // Session state from store
  const sessions = useSessions()
  const activeSessionId = useActiveSessionId()
  const setActiveSession = useStore((state) => state.setActiveSession)
  const addSession = useStore((state) => state.addSession)
  const updateSession = useStore((state) => state.updateSession)
  const removeSession = useStore((state) => state.removeSession)
  const hiddenSessionIds = useStore((state) => state.hiddenSessionIds)
  const hiddenFolders = useStore((state) => state.hiddenFolders)
  const sortOrder = useStore((state) => state.sortOrder)
  const hideFolder = useStore((state) => state.hideFolder)
  const unhideFolder = useStore((state) => state.unhideFolder)
  const setSortOrder = useStore((state) => state.setSortOrder)

  // Message state from store - use stable empty array to avoid infinite re-renders
  const messages = useSessionMessages(activeSessionId)
  const setMessages = useStore((state) => state.setMessages)
  const mergeSubagentTools = useStore((state) => state.mergeSubagentTools)
  const hasMessages = useStore((state) => state.hasMessages)

  const [discoveredSessions, setDiscoveredSessions] = useState<DiscoveredSession[]>([])
  const [loadingDiscovered, setLoadingDiscovered] = useState(true)

  const activeSession = useActiveSession()
  const sessionEvents = useSessionEvents(activeSessionId)

  const normalizeTranscriptMessage = useCallback(
    (message: TranscriptMessage): Message => ({
      ...message,
      timestamp: new Date(message.timestamp),
    }),
    []
  )

  // Callback when Claude session ID is obtained (first message)
  const handleClaudeSessionIdObtained = useCallback((claudeSessionId: string) => {
    if (activeSessionId) {
      updateSession(activeSessionId, { claudeSessionId })
    }
  }, [activeSessionId, updateSession])

  // Claude stream hook - now just returns streaming state and actions
  const {
    isStreaming,
    error,
    sendMessage,
    interrupt,
  } = useHorsemanEvents({
    uiSessionId: activeSessionId,
    claudeSessionId: activeSession?.claudeSessionId,
    workingDirectory: activeSession?.workingDirectory || null,
    onClaudeSessionIdObtained: handleClaudeSessionIdObtained,
  })

  // Check if any tools are running (covers gap between message and tool completion)
  const hasRunningTools = useHasRunningTools(activeSessionId)
  const isWorking = isStreaming || hasRunningTools

  // Load discovered sessions from ~/.claude/projects/ on startup
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await ipc.sessions.listAll()
        setDiscoveredSessions(sessions)
      } catch (e) {
        console.error('Failed to load discovered sessions:', e)
      } finally {
        setLoadingDiscovered(false)
      }
    }
    loadSessions()
  }, [])

  // Tab management
  const openTabIds = useStore((s) => s.openTabIds)
  const closeTab = useStore((s) => s.closeTab)
  const cyclePermissionMode = useStore((s) => s.cyclePermissionMode)

  // Load transcript for a session
  const loadTranscriptForSession = useCallback(async (
    sessionId: string,
    transcriptPath: string
  ) => {
    // Skip if already loaded
    if (hasMessages(sessionId)) {
      return
    }

    try {
      const parsed = await ipc.sessions.parseTranscript(transcriptPath)
      const parsedMessages = parsed.messages.map(normalizeTranscriptMessage)
      const { todos, usage, totalCostUsd, pendingQuestion, summaries, subagentTools } = parsed

      // Set messages in store
      setMessages(sessionId, parsedMessages)

      // Merge subagent tools (from separate transcript files) into toolsById
      if (subagentTools && subagentTools.length > 0) {
        mergeSubagentTools(sessionId, subagentTools)
      }

      // Update session with todos, usage, and pending question if present
      const updates: Partial<Session> = {}
      if (todos) updates.currentTodos = todos
      if (usage) updates.usage = usage
      if (totalCostUsd !== null) updates.totalCostUsd = totalCostUsd
      if (pendingQuestion) updates.hasPendingQuestion = true

      // Convert transcript summaries to compaction events
      // Use the first message timestamp as the compaction time (since summaries appear before messages)
      if (summaries && summaries.length > 0) {
        const firstMessageTime = parsedMessages[0]?.timestamp
          ? new Date(parsedMessages[0].timestamp).toISOString()
          : new Date().toISOString()

        updates.events = summaries.map((s, i) => ({
          type: 'compacted' as const,
          // Offset each summary slightly so they maintain order
          timestamp: new Date(new Date(firstMessageTime).getTime() - (summaries.length - i) * 1000).toISOString(),
          summary: s.summary,
        }))
      }

      if (Object.keys(updates).length > 0) {
        updateSession(sessionId, updates)
      }
    } catch (e) {
      console.error('Failed to load transcript:', e)
    }
  }, [hasMessages, setMessages, mergeSubagentTools, updateSession, normalizeTranscriptMessage])

  // Create new session (with folder picker)
  const handleNewSession = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select working directory',
    })

    if (selected && typeof selected === 'string') {
      const folderName = selected.split('/').pop() || 'New Session'
      const newSession: Session = {
        id: nanoid(),
        name: folderName,
        workingDirectory: selected,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        status: 'idle',
        permissionMode: 'default',
        isDiscovered: false,
      }
      addSession(newSession)
      setActiveSession(newSession.id)
    }
  }, [addSession, setActiveSession])

  // Create new tab in same directory as active session
  const handleNewTabInSameDirectory = useCallback(() => {
    const workingDir = activeSession?.workingDirectory
    if (!workingDir) {
      // No active session, fall back to folder picker
      handleNewSession()
      return
    }

    const newSession: Session = {
      id: nanoid(),
      name: 'New chat',  // Will be updated on first message
      workingDirectory: workingDir,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      status: 'idle',
      permissionMode: 'default',
      isDiscovered: false,
    }
    addSession(newSession)
    setActiveSession(newSession.id)
  }, [activeSession, addSession, setActiveSession, handleNewSession])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift+Tab to cycle permission modes (works everywhere)
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        cyclePermissionMode()
        return
      }

      // Alt+M fallback for permission mode
      if (e.altKey && e.key === 'm') {
        e.preventDefault()
        cyclePermissionMode()
        return
      }

      // Cmd/Ctrl shortcuts
      if (e.metaKey || e.ctrlKey) {
        // ⌘N - New session (folder picker)
        if (e.key === 'n') {
          e.preventDefault()
          handleNewSession()
          return
        }

        // ⌘T - New tab (same directory)
        if (e.key === 't') {
          e.preventDefault()
          handleNewTabInSameDirectory()
          return
        }

        // ⌘W - Close current tab
        if (e.key === 'w' && activeSessionId) {
          e.preventDefault()
          closeTab(activeSessionId)
          return
        }

        // ⌘1-9 - Switch to tab by index
        const digit = parseInt(e.key)
        if (digit >= 1 && digit <= 9 && openTabIds.length > 0) {
          e.preventDefault()
          const tabIndex = digit - 1
          if (tabIndex < openTabIds.length) {
            setActiveSession(openTabIds[tabIndex])
          }
          return
        }

        // ⌘[ - Previous tab
        if (e.key === '[' && openTabIds.length > 1 && activeSessionId) {
          e.preventDefault()
          const currentIndex = openTabIds.indexOf(activeSessionId)
          const prevIndex = currentIndex <= 0 ? openTabIds.length - 1 : currentIndex - 1
          setActiveSession(openTabIds[prevIndex])
          return
        }

        // ⌘] - Next tab
        if (e.key === ']' && openTabIds.length > 1 && activeSessionId) {
          e.preventDefault()
          const currentIndex = openTabIds.indexOf(activeSessionId)
          const nextIndex = currentIndex >= openTabIds.length - 1 ? 0 : currentIndex + 1
          setActiveSession(openTabIds[nextIndex])
          return
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [cyclePermissionMode, handleNewSession, handleNewTabInSameDirectory, activeSessionId, openTabIds, closeTab, setActiveSession])

  // Select existing session
  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSession(id)

    // Find the session and load transcript if it has a claudeSessionId
    const session = sessions.find((s) => s.id === id)
    if (session?.claudeSessionId && !hasMessages(id)) {
      // Find the transcript in discovered sessions
      const discovered = discoveredSessions.find((ds) => ds.id === session.claudeSessionId)
      if (discovered?.transcript_path) {
        await loadTranscriptForSession(id, discovered.transcript_path)
      }
    }
  }, [setActiveSession, sessions, discoveredSessions, hasMessages, loadTranscriptForSession])

  // Select discovered session
  const handleSelectDiscoveredSession = useCallback(async (ds: DiscoveredSession) => {
    const existingSession = sessions.find((s) => s.id === ds.id)
    if (!existingSession) {
      // For discovered sessions, the session ID IS the Claude session ID
      addSession({
        id: ds.id,
        name: ds.first_message?.slice(0, 30) || ds.id.slice(0, 8),
        workingDirectory: ds.working_directory,
        createdAt: ds.modified_at,
        lastActiveAt: ds.modified_at,
        status: 'idle',
        permissionMode: 'default',
        claudeSessionId: ds.id,  // Discovered sessions already have a Claude ID
        isDiscovered: true,      // Mark as originating from CLI
      })
    }
    setActiveSession(ds.id)

    // Load transcript for this session
    if (ds.transcript_path) {
      await loadTranscriptForSession(ds.id, ds.transcript_path)
    }
  }, [sessions, addSession, setActiveSession, loadTranscriptForSession])

  // Rename session
  const handleRenameSession = useCallback((id: string, newName: string) => {
    updateSession(id, { name: newName })
  }, [updateSession])

  // Delete session (UI only, doesn't touch transcript files)
  const handleDeleteSession = useCallback((id: string) => {
    removeSession(id)
  }, [removeSession])

  // Send message to Claude
  const handleSendMessage = useCallback(async (text: string, fileBlocks?: FileBlock[]) => {
    if (!activeSession || !activeSessionId) return

    // Update session name from first message (truncate to 40 chars)
    const isFirstMessage = !hasMessages(activeSessionId)
    if (isFirstMessage && activeSession.name === 'New chat') {
      const newName = text.slice(0, 40) + (text.length > 40 ? '...' : '')
      updateSession(activeSession.id, { name: newName })
    }

    // Check for compaction context to inject (first message only after compaction)
    let sendText: string | undefined
    const lastCompaction = sessionEvents
      .filter((e): e is Extract<typeof e, { type: 'compacted' }> => e.type === 'compacted')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

    if (lastCompaction) {
      const lastInjected = activeSession.lastCompactionInjectedAt
      const compactionTime = new Date(lastCompaction.timestamp).getTime()
      const injectedTime = lastInjected ? new Date(lastInjected).getTime() : 0

      // If there's a compaction newer than last injection, inject context (send only, not display)
      if (compactionTime > injectedTime) {
        sendText = `[Context: This conversation was compacted. Summary: ${lastCompaction.summary}]\n\n${text}`
        // Mark as injected so we don't inject again
        updateSession(activeSession.id, { lastCompactionInjectedAt: lastCompaction.timestamp })
      }
    }

    // Send message - display original text, optionally send modified text to Claude
    await sendMessage(text, fileBlocks, sendText)
  }, [activeSession, activeSessionId, sendMessage, updateSession, hasMessages, sessionEvents])

  // Stop Claude
  const handleStop = useCallback(async () => {
    await interrupt()
  }, [interrupt])

  return (
    <>
      <AppLayout
        sidebar={
          <Sidebar
            sessions={sessions}
            discoveredSessions={discoveredSessions}
            hiddenSessionIds={hiddenSessionIds}
            hiddenFolders={hiddenFolders}
            sortOrder={sortOrder}
            activeSessionId={activeSessionId}
            isLoading={loadingDiscovered}
            onNewSession={handleNewSession}
            onSelectSession={handleSelectSession}
            onSelectDiscoveredSession={handleSelectDiscoveredSession}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
            onHideFolder={hideFolder}
            onUnhideFolder={unhideFolder}
            onSetSortOrder={setSortOrder}
          />
        }
        tabBar={<TabBar onNewSession={handleNewTabInSameDirectory} />}
        main={
          activeSession ? (
            <ChatView
              key={activeSession.id}
              uiSessionId={activeSession.id}
              claudeSessionId={activeSession.claudeSessionId}
              workingDirectory={activeSession.workingDirectory}
              messages={messages}
              isWorking={isWorking}
              error={error}
              currentTodos={activeSession.currentTodos}
              usage={activeSession.usage}
              onSendMessage={handleSendMessage}
              onStop={handleStop}
            />
          ) : (
            <EmptyState onNewSession={handleNewSession} />
          )
        }
      />

    </>
  )
}

export default App
