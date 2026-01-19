import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { useActivePlan } from '@/store/selectors'
import { FileCheck, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PlanOverlay() {
  const activePlan = useActivePlan()
  const resolvePlan = useStore((s) => s.resolvePlan)
  const [isProcessing, setIsProcessing] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const feedbackRef = useRef<HTMLTextAreaElement>(null)

  const getRequestId = useCallback(() => {
    // Use permissionRequestId if available, fall back to toolId
    return activePlan?.permissionRequestId || activePlan?.toolId
  }, [activePlan])

  const handleAccept = useCallback(async () => {
    const requestId = getRequestId()
    if (!requestId || isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(requestId, true, {})
      resolvePlan('accept')
    } catch (err) {
      console.error('Failed to accept plan:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [getRequestId, isProcessing, resolvePlan])

  const handleAcceptAutoEdits = useCallback(async () => {
    const requestId = getRequestId()
    if (!requestId || isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(requestId, true, {})
      resolvePlan('acceptAutoEdits')
    } catch (err) {
      console.error('Failed to accept plan with auto-edits:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [getRequestId, isProcessing, resolvePlan])

  const handleReject = useCallback(async () => {
    const requestId = getRequestId()
    if (!requestId || isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(requestId, false, {
        message: feedbackText || 'Plan rejected by user',
      })
      resolvePlan('reject', feedbackText)
    } catch (err) {
      console.error('Failed to reject plan:', err)
    } finally {
      setIsProcessing(false)
      setFeedbackOpen(false)
      setFeedbackText('')
    }
  }, [getRequestId, isProcessing, feedbackText, resolvePlan])

  const openFeedback = useCallback(() => {
    setFeedbackOpen(true)
    setFeedbackText('')
  }, [])

  const closeFeedback = useCallback(() => {
    setFeedbackOpen(false)
    setFeedbackText('')
  }, [])

  // Keyboard navigation
  useEffect(() => {
    if (!activePlan) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        // Handle feedback-specific keys
        if (feedbackOpen) {
          if (e.key === 'Escape') {
            e.preventDefault()
            closeFeedback()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleReject()
          }
        }
        return
      }

      if (feedbackOpen) {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeFeedback()
        }
        return
      }

      // Main keyboard shortcuts
      switch (e.key) {
        case '1':
        case 'Enter':
          e.preventDefault()
          handleAcceptAutoEdits()
          break
        case '2':
          e.preventDefault()
          handleAccept()
          break
        case '3':
        case 'Escape':
          e.preventDefault()
          openFeedback()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePlan, feedbackOpen, handleAccept, handleAcceptAutoEdits, handleReject, openFeedback, closeFeedback])

  // Focus feedback textarea when opened
  useEffect(() => {
    if (feedbackOpen && feedbackRef.current) {
      feedbackRef.current.focus()
    }
  }, [feedbackOpen])

  if (!activePlan) return null

  return (
    <div className="group flex w-full max-w-[95%] flex-col gap-2">
      <div className="flex w-fit max-w-full min-w-0 flex-col gap-3 text-sm">
        {/* Header */}
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <FileCheck className="h-4 w-4 shrink-0" />
          <span className="font-medium">Plan ready for approval</span>
        </div>

        {feedbackOpen ? (
          /* Feedback mode */
          <div className="flex flex-col gap-2 w-full">
            <textarea
              ref={feedbackRef}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="What should Claude do differently?"
              className="w-full p-3 rounded-md border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={closeFeedback}
                disabled={isProcessing}
                className="h-7 px-3 text-xs"
              >
                Cancel
                <kbd className="ml-1.5 text-[10px] text-muted-foreground">Esc</kbd>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReject}
                disabled={isProcessing}
                className="h-7 px-3 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Reject
                <kbd className="ml-1.5 text-[10px] text-muted-foreground">⌘↵</kbd>
              </Button>
            </div>
          </div>
        ) : (
          /* Action buttons */
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAcceptAutoEdits}
              disabled={isProcessing}
              className={cn(
                "h-7 px-3 text-xs font-medium",
                "text-green-600 hover:text-green-700 hover:bg-green-500/10"
              )}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Accept + Auto
              <kbd className="ml-1.5 text-[10px] text-muted-foreground">1</kbd>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleAccept}
              disabled={isProcessing}
              className="h-7 px-3 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-500/10"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Accept
              <kbd className="ml-1.5 text-[10px] text-muted-foreground">2</kbd>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={openFeedback}
              disabled={isProcessing}
              className="h-7 px-3 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Reject
              <kbd className="ml-1.5 text-[10px] text-muted-foreground">3</kbd>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
