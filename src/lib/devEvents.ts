/**
 * Dev-only synthetic event injection for testing UI flows
 *
 * Usage from browser console:
 *   window.__dev.triggerPlanMode('some plan content')
 *   window.__dev.triggerPermission('Bash', { command: 'rm -rf /' })
 *   window.__dev.triggerTool('Read', { file_path: '/foo/bar.ts' })
 */

import { emit } from '@tauri-apps/api/event'
import type { BackendEvent } from '@/domain'

const generateId = () => Math.random().toString(36).slice(2, 10)

export const devEvents = {
  /**
   * Simulate ExitPlanMode tool being called - triggers plan overlay
   */
  async triggerPlanMode(planContent: string, sessionId?: string) {
    const uiSessionId = sessionId || 'dev-session'
    const toolId = `toolu_dev_${generateId()}`

    // First emit an assistant message with the plan text
    await emit<BackendEvent>('horseman-event', {
      type: 'message.assistant',
      uiSessionId,
      message: {
        id: `msg_dev_${generateId()}`,
        role: 'assistant',
        text: planContent,
        toolCalls: [{
          id: toolId,
          name: 'ExitPlanMode',
          input: {},
          status: 'running',
          startedAt: new Date().toISOString(),
        }],
        timestamp: new Date().toISOString(),
      },
    })

    // Then emit the tool.started event
    await emit<BackendEvent>('horseman-event', {
      type: 'tool.started',
      uiSessionId,
      tool: {
        id: toolId,
        name: 'ExitPlanMode',
        input: {},
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    })

    console.log('[DEV] Triggered plan mode with tool:', toolId)
    return toolId
  },

  /**
   * Simulate EnterPlanMode tool being called
   */
  async triggerEnterPlanMode(sessionId?: string) {
    const uiSessionId = sessionId || 'dev-session'
    const toolId = `toolu_dev_${generateId()}`

    await emit<BackendEvent>('horseman-event', {
      type: 'tool.started',
      uiSessionId,
      tool: {
        id: toolId,
        name: 'EnterPlanMode',
        input: {},
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    })

    console.log('[DEV] Triggered EnterPlanMode')
    return toolId
  },

  /**
   * Simulate a permission request
   */
  async triggerPermission(toolName: string, toolInput: Record<string, unknown> = {}) {
    const requestId = `perm_dev_${generateId()}`

    await emit<BackendEvent>('horseman-event', {
      type: 'permission.requested',
      requestId,
      toolName,
      toolInput,
    })

    console.log('[DEV] Triggered permission request:', requestId)
    return requestId
  },

  /**
   * Simulate a question request
   */
  async triggerQuestion(questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect?: boolean
  }>) {
    const requestId = `q_dev_${generateId()}`

    await emit<BackendEvent>('horseman-event', {
      type: 'question.requested',
      requestId,
      question: {
        requestId,
        sessionId: 'dev-session',
        toolUseId: `toolu_dev_${generateId()}`,
        questions: questions.map(q => ({
          ...q,
          multiSelect: q.multiSelect ?? false,
        })),
        timestamp: Date.now(),
      },
    })

    console.log('[DEV] Triggered question request:', requestId)
    return requestId
  },

  /**
   * Simulate a tool starting
   */
  async triggerTool(toolName: string, input: Record<string, unknown> = {}, sessionId?: string) {
    const uiSessionId = sessionId || 'dev-session'
    const toolId = `toolu_dev_${generateId()}`

    await emit<BackendEvent>('horseman-event', {
      type: 'tool.started',
      uiSessionId,
      tool: {
        id: toolId,
        name: toolName,
        input,
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    })

    console.log('[DEV] Triggered tool:', toolName, toolId)
    return toolId
  },

  /**
   * Complete a tool with output
   */
  async completeTool(toolId: string, output: string, sessionId?: string) {
    const uiSessionId = sessionId || 'dev-session'

    await emit<BackendEvent>('horseman-event', {
      type: 'tool.completed',
      uiSessionId,
      toolId,
      output,
    })

    console.log('[DEV] Completed tool:', toolId)
  },

  /**
   * Simulate an assistant message
   */
  async triggerMessage(text: string, sessionId?: string) {
    const uiSessionId = sessionId || 'dev-session'

    await emit<BackendEvent>('horseman-event', {
      type: 'message.assistant',
      uiSessionId,
      message: {
        id: `msg_dev_${generateId()}`,
        role: 'assistant',
        text,
        timestamp: new Date().toISOString(),
      },
    })

    console.log('[DEV] Triggered message')
  },
}

// Expose to window for console access in dev mode
if (typeof window !== 'undefined') {
  (window as unknown as { __dev: typeof devEvents }).__dev = devEvents
}

export function initDevTools() {
  // Also expose store for debugging
  import('@/store').then(({ useStore }) => {
    (window as unknown as { __store: typeof useStore }).__store = useStore
  })

  console.log('[DEV] Dev tools available at window.__dev')
  console.log('[DEV] Store available at window.__store')
  console.log('[DEV] Examples:')
  console.log('  __dev.triggerPlanMode("## My Plan\\n1. Do this\\n2. Do that")')
  console.log('  __dev.triggerPermission("Bash", { command: "ls -la" })')
  console.log('  __dev.triggerTool("Read", { file_path: "/foo.ts" })')
  console.log('  __store.getState().activePlan  // check plan state')
}
