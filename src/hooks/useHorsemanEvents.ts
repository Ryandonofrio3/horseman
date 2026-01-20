import { useCallback, useEffect, useRef, useState } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { ipc, SpawnSessionArgs } from '@/lib/ipc'
import { useStore } from '@/store'
import { createUserMessage } from '@/lib/parseClaudeEvents'
import type { BackendEvent, BackendMessage, FileBlock, Message } from '@/domain'

interface UseHorsemanEventsOptions {
  uiSessionId: string | null
  claudeSessionId: string | undefined
  workingDirectory: string | null
  onClaudeSessionIdObtained?: (claudeSessionId: string) => void
}

export function useHorsemanEvents({
  uiSessionId,
  claudeSessionId,
  workingDirectory,
  onClaudeSessionIdObtained,
}: UseHorsemanEventsOptions) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addMessage = useStore((s) => s.addMessage)
  const updateMessage = useStore((s) => s.updateMessage)
  const updateToolOutput = useStore((s) => s.updateToolOutput)
  const updateToolFields = useStore((s) => s.updateToolFields)
  const updateSession = useStore((s) => s.updateSession)
  const addPendingPermission = useStore((s) => s.addPendingPermission)
  const addPendingQuestion = useStore((s) => s.addPendingQuestion)
  const removePendingPermission = useStore((s) => s.removePendingPermission)
  const removePendingQuestion = useStore((s) => s.removePendingQuestion)
  const startSlashCommand = useStore((s) => s.startSlashCommand)
  const appendSlashOutput = useStore((s) => s.appendSlashOutput)
  const setSlashDetectionMethod = useStore((s) => s.setSlashDetectionMethod)
  const endSlashCommand = useStore((s) => s.endSlashCommand)
  const failSlashCommand = useStore((s) => s.failSlashCommand)
  const enterPlanMode = useStore((s) => s.enterPlanMode)
  const model = useStore((s) => s.model)

  // Sync UI session ID for async event filtering
  const uiSessionIdRef = useRef<string | null>(uiSessionId)
  uiSessionIdRef.current = uiSessionId

  // Track the current Claude session ID
  const activeClaudeSessionRef = useRef<string | null>(claudeSessionId || null)

  // Always sync to the latest claudeSessionId (including null)
  useEffect(() => {
    activeClaudeSessionRef.current = claudeSessionId || null
  }, [claudeSessionId])

  // Track the last assistant message for streaming updates
  const lastAssistantMessageIdRef = useRef<string | null>(null)

  // Keep callback ref up to date
  const onClaudeSessionIdObtainedRef = useRef(onClaudeSessionIdObtained)
  useEffect(() => {
    onClaudeSessionIdObtainedRef.current = onClaudeSessionIdObtained
  }, [onClaudeSessionIdObtained])

  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    let isMounted = true

    const normalizeMessage = (message: BackendMessage): Message => ({
      ...message,
      timestamp: new Date(message.timestamp),
    })

    const markStreamingComplete = (sessionId: string | null) => {
      if (!sessionId) return
      if (!lastAssistantMessageIdRef.current) return
      updateMessage(sessionId, lastAssistantMessageIdRef.current, { isStreaming: false })
    }

    const setup = async () => {
      const unlistenFn = await listen<BackendEvent>('horseman-event', (event) => {
        if (!isMounted) return

        const payload = event.payload

        switch (payload.type) {
          case 'session.started': {
            updateSession(payload.uiSessionId, {
              claudeSessionId: payload.claudeSessionId,
              status: 'running',
            })
            if (payload.uiSessionId === uiSessionIdRef.current) {
              activeClaudeSessionRef.current = payload.claudeSessionId
              onClaudeSessionIdObtainedRef.current?.(payload.claudeSessionId)
              setIsStreaming(true)
              setError(null)
            }
            break
          }
          case 'session.ended': {
            updateSession(payload.uiSessionId, {
              status: payload.error ? 'error' : 'idle',
            })
            if (payload.uiSessionId === uiSessionIdRef.current) {
              setIsStreaming(false)
              markStreamingComplete(uiSessionIdRef.current)
              if (payload.error) {
                setError(payload.error)
              }
            }
            break
          }
          case 'message.assistant': {
            const message = normalizeMessage(payload.message)
            addMessage(payload.uiSessionId, message)
            updateSession(payload.uiSessionId, { status: 'running' })
            if (payload.uiSessionId === uiSessionIdRef.current) {
              lastAssistantMessageIdRef.current = message.id
              setIsStreaming(true)
            }
            break
          }
          case 'message.user':
          case 'message.streaming':
            break
          case 'tool.started': {
            console.log('[TOOL.STARTED]', payload.tool.name, payload.tool.id)
            updateToolFields(payload.uiSessionId, payload.tool.id, payload.tool)

            // EnterPlanMode - Claude enters planning mode, sync UI badge
            if (payload.tool.name === 'EnterPlanMode') {
              console.log('[PLAN] EnterPlanMode detected, setting permissionMode to plan')
              useStore.getState().setPermissionMode('plan')
            }

            // ExitPlanMode - Claude finished planning, show plan overlay for approval
            if (payload.tool.name === 'ExitPlanMode') {
              console.log('[PLAN] ExitPlanMode detected, entering plan mode')
              const state = useStore.getState()
              const sessionState = state.sessions[payload.uiSessionId]
              const messages = sessionState?.messages || []
              // Get the last assistant message content as plan
              const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
              const planContent = lastAssistant?.text || ''
              console.log('[PLAN] Plan content length:', planContent.length, 'chars')
              enterPlanMode(payload.uiSessionId, payload.tool.id, planContent)
              console.log('[PLAN] enterPlanMode called, activePlan should be set')
            }
            break
          }
          case 'tool.updated':
            updateToolFields(payload.uiSessionId, payload.toolId, payload.update)
            break
          case 'tool.completed':
            updateToolOutput(payload.uiSessionId, '', payload.toolId, payload.output)
            break
          case 'tool.error':
            updateToolFields(payload.uiSessionId, payload.toolId, {
              status: 'error',
              error: payload.error,
              output: payload.error,
              endedAt: new Date().toISOString(),
            })
            break
          case 'todos.updated':
            updateSession(payload.uiSessionId, { currentTodos: payload.todos })
            break
          case 'usage.updated': {
            updateSession(payload.uiSessionId, {
              usage: payload.usage,
              status: 'idle',
              ...(payload.usage.cost != null ? { totalCostUsd: payload.usage.cost } : {}),
            })
            if (payload.uiSessionId === uiSessionIdRef.current) {
              setIsStreaming(false)
              markStreamingComplete(uiSessionIdRef.current)
            }
            break
          }
          case 'permission.requested': {
            const state = useStore.getState()
            const mode = state.permissionMode

            // ExitPlanMode - route to plan overlay, skip regular permissions
            if (payload.toolName === 'ExitPlanMode') {
              useStore.getState().setPlanPermissionId(payload.requestId)
              break
            }

            const isEditTool = ['Edit', 'Write'].includes(payload.toolName)

            // Bypass All mode - auto-approve everything
            if (mode === 'bypassPermissions') {
              ipc.permissions.respond(payload.requestId, true, {}).catch(console.error)
              break
            }

            // Auto-Accept mode - auto-approve Edit/Write only
            if (mode === 'acceptEdits' && isEditTool) {
              ipc.permissions.respond(payload.requestId, true, {}).catch(console.error)
              break
            }

            // Use session ID from event (passed through MCP chain), fallback to orphan
            const permSessionId = payload.uiSessionId || 'orphan'

            addPendingPermission({
              requestId: payload.requestId,
              sessionId: permSessionId,
              toolName: payload.toolName,
              toolInput: payload.toolInput,
              timestamp: Date.now(),
            })
            if (permSessionId !== 'orphan') {
              updateSession(permSessionId, { status: 'waiting_permission' })
            }
            break
          }
          case 'permission.resolved': {
            removePendingPermission(payload.requestId)
            // Recalculate status - check if other permissions/questions pending
            const state = useStore.getState()
            const sessionId = uiSessionIdRef.current
            if (sessionId) {
              const hasPermissions = state.pendingPermissions.some(p => p.sessionId === sessionId)
              const hasQuestions = state.pendingQuestions.some(q => q.sessionId === sessionId)
              if (hasQuestions) {
                updateSession(sessionId, { status: 'waiting_question' })
              } else if (hasPermissions) {
                updateSession(sessionId, { status: 'waiting_permission' })
              } else {
                updateSession(sessionId, { status: 'running' })
              }
            }
            break
          }
          case 'question.requested': {
            // Session ID is now set correctly by Rust via MCP chain
            console.log('[QUESTION] Received question.requested', {
              requestId: payload.question.requestId,
              sessionId: payload.question.sessionId,
              questionsCount: payload.question.questions?.length ?? 0,
              questions: payload.question.questions,
            })
            addPendingQuestion(payload.question)
            if (payload.question.sessionId !== 'orphan') {
              updateSession(payload.question.sessionId, { status: 'waiting_question' })
            }
            break
          }
          case 'question.resolved': {
            removePendingQuestion(payload.requestId)
            // Recalculate status
            const state = useStore.getState()
            const sessionId = uiSessionIdRef.current
            if (sessionId) {
              const hasPermissions = state.pendingPermissions.some(p => p.sessionId === sessionId)
              const hasQuestions = state.pendingQuestions.some(q => q.sessionId === sessionId)
              if (hasQuestions) {
                updateSession(sessionId, { status: 'waiting_question' })
              } else if (hasPermissions) {
                updateSession(sessionId, { status: 'waiting_permission' })
              } else {
                updateSession(sessionId, { status: 'running' })
              }
            }
            break
          }
          case 'slash.started':
            startSlashCommand(payload.commandId)
            break
          case 'slash.output':
            appendSlashOutput(payload.commandId, payload.data)
            break
          case 'slash.detected':
            setSlashDetectionMethod(payload.commandId, payload.method)
            break
          case 'slash.completed':
            endSlashCommand(payload.commandId)
            break
          case 'slash.error':
            failSlashCommand(payload.commandId, payload.message)
            break
        }
      })

      if (isMounted) {
        unlisten = unlistenFn
      } else {
        unlistenFn()
      }
    }

    setup()

    return () => {
      isMounted = false
      if (unlisten) {
        unlisten()
      }
    }
  }, [
    addMessage,
    updateMessage,
    updateToolOutput,
    updateToolFields,
    updateSession,
    addPendingPermission,
    addPendingQuestion,
    removePendingPermission,
    removePendingQuestion,
    startSlashCommand,
    appendSlashOutput,
    setSlashDetectionMethod,
    endSlashCommand,
    failSlashCommand,
    enterPlanMode,
  ])

  const startSession = useCallback(async (initialPrompt: string, fileBlocks?: FileBlock[]) => {
    if (!workingDirectory || !uiSessionId) {
      setError('No active session')
      return null
    }

    try {
      setError(null)
      lastAssistantMessageIdRef.current = null

      addMessage(uiSessionId, createUserMessage(initialPrompt, undefined, fileBlocks))

      const args: SpawnSessionArgs = {
        ui_session_id: uiSessionId,
        working_directory: workingDirectory,
        initial_prompt: initialPrompt,
        resume_session: claudeSessionId,
        model,
      }

      const result = await ipc.claude.spawn(args)

      return result.session_id
    } catch (e) {
      setError(String(e))
      return null
    }
  }, [workingDirectory, uiSessionId, claudeSessionId, addMessage, model])

  const sendMessage = useCallback(async (content: string, fileBlocks?: FileBlock[]) => {
    const activeClaudeSession = activeClaudeSessionRef.current
    const currentUiSessionId = uiSessionIdRef.current

    if (!activeClaudeSession || !workingDirectory) {
      return startSession(content, fileBlocks)
    }

    if (!currentUiSessionId) {
      setError('No active session')
      return null
    }

    try {
      setIsStreaming(true)
      lastAssistantMessageIdRef.current = null

      addMessage(currentUiSessionId, createUserMessage(content, undefined, fileBlocks))

      await ipc.claude.sendMessage(
        currentUiSessionId,
        activeClaudeSession,
        workingDirectory,
        content,
        model
      )
      return currentUiSessionId
    } catch (e) {
      setError(String(e))
      setIsStreaming(false)
      return null
    }
  }, [workingDirectory, startSession, addMessage, model])

  const interrupt = useCallback(async () => {
    const currentUiSessionId = uiSessionIdRef.current
    if (!currentUiSessionId) return

    try {
      await ipc.claude.interrupt(currentUiSessionId)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  return {
    isStreaming,
    error,
    sendMessage,
    interrupt,
  }
}
