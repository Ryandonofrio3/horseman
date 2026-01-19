import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { MessageResponse } from '@/components/ai-elements/message'
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanFooter,
  PlanTrigger,
} from '@/components/ai-elements/plan'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { useActivePlan } from '@/store/selectors'
import { FileText, Check, X, Pencil } from 'lucide-react'

export function PlanOverlay() {
  const activePlan = useActivePlan()
  const resolvePlan = useStore((s) => s.resolvePlan)
  const [isProcessing, setIsProcessing] = useState(false)

  // Consolidate feedback state
  const [feedbackState, setFeedbackState] = useState<{ isOpen: boolean; text: string }>({
    isOpen: false,
    text: '',
  })

  // Helper functions
  const openFeedback = useCallback(() => {
    setFeedbackState({ isOpen: true, text: '' })
  }, [])

  const closeFeedback = useCallback(() => {
    setFeedbackState({ isOpen: false, text: '' })
  }, [])

  const updateFeedbackText = useCallback((text: string) => {
    setFeedbackState((prev) => ({ ...prev, text }))
  }, [])

  const handleAccept = useCallback(async () => {
    if (!activePlan || isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(activePlan.toolId, true, {})
      resolvePlan('accept')
    } catch (err) {
      console.error('Failed to accept plan:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [activePlan, isProcessing, resolvePlan])

  const handleAcceptAutoEdits = useCallback(async () => {
    if (!activePlan || isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(activePlan.toolId, true, {})
      resolvePlan('acceptAutoEdits')
    } catch (err) {
      console.error('Failed to accept plan with auto-edits:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [activePlan, isProcessing, resolvePlan])

  const handleReject = useCallback(async () => {
    if (!activePlan || isProcessing) return
    setIsProcessing(true)
    try {
      await ipc.permissions.respond(activePlan.toolId, false, {
        message: feedbackState.text || 'Plan rejected by user',
      })
      resolvePlan('reject', feedbackState.text)
    } catch (err) {
      console.error('Failed to reject plan:', err)
    } finally {
      setIsProcessing(false)
      closeFeedback()
    }
  }, [activePlan, isProcessing, feedbackState.text, resolvePlan, closeFeedback])

  if (!activePlan) return null

  return (
    <div className="px-4 pb-4">
      <Plan defaultOpen className="border-blue-500/30 bg-blue-500/5">
        <PlanHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            <PlanTitle>Plan Review</PlanTitle>
          </div>
          <PlanDescription>Claude has proposed a plan and is waiting for your approval.</PlanDescription>
          <PlanTrigger />
        </PlanHeader>
        <PlanContent className="max-h-[40vh] overflow-y-auto">
          <MessageResponse>{activePlan.content}</MessageResponse>
        </PlanContent>
        <PlanFooter className="flex flex-col gap-3 pt-3 border-t">
          {feedbackState.isOpen ? (
            <div className="flex flex-col gap-2 w-full">
              <textarea
                value={feedbackState.text}
                onChange={(e) => updateFeedbackText(e.target.value)}
                placeholder="What should Claude do differently?"
                className="w-full p-3 rounded-md border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeFeedback}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                  Reject with Feedback
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={handleAcceptAutoEdits}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="h-4 w-4" />
                Accept + Auto Edits
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAccept}
                disabled={isProcessing}
              >
                <Check className="h-4 w-4" />
                Accept
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={openFeedback}
                disabled={isProcessing}
              >
                <Pencil className="h-4 w-4" />
                Reject + Feedback
              </Button>
            </div>
          )}
        </PlanFooter>
      </Plan>
    </div>
  )
}
