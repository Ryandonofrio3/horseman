import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Check, X, ShieldAlert } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { PendingPermission } from '@/store/types'
import { cn } from '@/lib/utils'

interface PermissionCardProps {
  permission: PendingPermission
  queueTotal?: number
}

function formatToolInput(input: Record<string, unknown>): string {
  if (input.command) return String(input.command)
  if (input.file_path) return String(input.file_path)
  if (input.url) return String(input.url)
  if (input.query) return String(input.query)
  if (input.pattern) return String(input.pattern)
  return JSON.stringify(input, null, 2)
}

function getToolVerb(toolName: string): string {
  switch (toolName) {
    case 'Edit': return 'edit'
    case 'Write': return 'write to'
    case 'Bash': return 'run'
    case 'WebFetch': return 'fetch'
    case 'WebSearch': return 'search'
    case 'NotebookEdit': return 'edit'
    default: return 'use'
  }
}

export function PermissionCard({ permission, queueTotal }: PermissionCardProps) {
  const removePendingPermission = useStore((s) => s.removePendingPermission)
  const appendSessionEvent = useStore((s) => s.appendSessionEvent)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const [isProcessing, setIsProcessing] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(170)

  // Get session ID for event logging - use permission's sessionId if valid, else active session
  const eventSessionId = (permission.sessionId && permission.sessionId !== 'mcp')
    ? permission.sessionId
    : activeSessionId

  const handleDeny = useCallback(async (message?: string) => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(permission.requestId, false, {
        message: message ?? 'Denied by user',
      })
      removePendingPermission(permission.requestId)

      // Log permission event
      if (eventSessionId) {
        appendSessionEvent(eventSessionId, {
          type: 'permission',
          timestamp: new Date().toISOString(),
          tool: permission.toolName,
          allowed: false,
          path: permission.toolInput.file_path as string | undefined,
        })
      }
    } catch (err) {
      console.error('Failed to deny permission:', err)
      setIsProcessing(false)
    }
  }, [permission.requestId, permission.toolName, permission.toolInput.file_path, isProcessing, removePendingPermission, eventSessionId, appendSessionEvent])

  // Ref to avoid stale closure in interval
  const handleDenyRef = useRef(handleDeny)
  handleDenyRef.current = handleDeny

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          handleDenyRef.current('Timed out')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [permission.requestId])

  const handleAllow = useCallback(async (forSession: boolean) => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(permission.requestId, true, {
        toolName: permission.toolName,
        allowForSession: forSession,
      })
      removePendingPermission(permission.requestId)

      // Log permission event
      if (eventSessionId) {
        appendSessionEvent(eventSessionId, {
          type: 'permission',
          timestamp: new Date().toISOString(),
          tool: permission.toolName,
          allowed: true,
          path: permission.toolInput.file_path as string | undefined,
        })
      }
    } catch (err) {
      console.error('Failed to approve permission:', err)
      setIsProcessing(false)
    }
  }, [permission.requestId, permission.toolName, permission.toolInput.file_path, isProcessing, removePendingPermission, eventSessionId, appendSessionEvent])

  const inputPreview = formatToolInput(permission.toolInput)
  const isLongInput = inputPreview.length > 100
  const timerUrgent = secondsLeft <= 30
  const queueCount = queueTotal ?? 0
  const showQueue = queueCount > 1

  return (
    <div className="group flex w-full max-w-[95%] flex-col gap-2">
      <div className="flex w-fit max-w-full min-w-0 flex-col gap-3 text-sm">
        {/* Header */}
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            {permission.toolName} wants to {getToolVerb(permission.toolName)}
          </span>
          {showQueue && (
            <span className="ml-auto text-xs text-muted-foreground">
              Queue 1 of {queueTotal}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {showQueue && (
              <span className="text-xs text-muted-foreground">
                Queue 1 of {queueCount}
              </span>
            )}
            {timerUrgent && (
              <span
                className={cn(
                  "text-xs font-mono tabular-nums",
                  secondsLeft <= 10 ? "text-red-500 animate-pulse" : "text-amber-500"
                )}
              >
                {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
        </div>

        {/* Input preview */}
        <div className={cn(
          "px-3 py-2 rounded-md bg-muted/50 font-mono text-xs text-muted-foreground",
          "border border-border/50",
          isLongInput && "max-h-32 overflow-y-auto"
        )}>
          <pre className="whitespace-pre-wrap break-all">{inputPreview}</pre>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAllow(false)}
            disabled={isProcessing}
            className="h-7 px-3 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-500/10"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Allow
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAllow(true)}
            disabled={isProcessing}
            className="h-7 px-3 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-500/10"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Allow for session
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeny()}
            disabled={isProcessing}
            className="h-7 px-3 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10"
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Deny
          </Button>
        </div>
      </div>
    </div>
  )
}
