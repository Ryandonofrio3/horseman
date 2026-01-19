import { useEffect, useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PendingQuestion, Question, QuestionOption } from '@/store/types'
import { useStore } from '@/store'
import { MessageCircleQuestion, Check, Send } from 'lucide-react'
import { ipc } from '@/lib/ipc'

interface AskUserQuestionCardProps {
  question: PendingQuestion
}

export function AskUserQuestionCard({ question }: AskUserQuestionCardProps) {
  const removePendingQuestion = useStore((s) => s.removePendingQuestion)

  // Track selected answers for each question
  // For single select: { questionIndex: optionLabel }
  // For multi select: { questionIndex: [optionLabel1, optionLabel2] }
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({})
  const [otherInputs, setOtherInputs] = useState<Record<number, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(170)

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Time's up - deny the question
          handleTimeout()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [question.requestId])

  const handleTimeout = useCallback(async () => {
    try {
      await ipc.permissions.respond(question.requestId, false, {
        message: 'Timed out waiting for answer',
      })
      removePendingQuestion(question.requestId)
    } catch (err) {
      console.error('Failed to timeout question:', err)
    }
  }, [question.requestId, removePendingQuestion])

  const isQuestionAnswered = (q: Question, index: number) => {
    const answer = answers[index]
    if (q.multiSelect) {
      const selected = (answer as string[]) || []
      if (selected.includes('Other') && !otherInputs[index]) {
        return selected.length > 1
      }
      return selected.length > 0
    }
    if (answer === 'Other') {
      return !!otherInputs[index]
    }
    return !!answer
  }

  const handleOptionSelect = (questionIndex: number, optionLabel: string, multiSelect: boolean) => {
    setAnswers((prev) => {
      if (multiSelect) {
        const current = (prev[questionIndex] as string[]) || []
        if (current.includes(optionLabel)) {
          return { ...prev, [questionIndex]: current.filter((l) => l !== optionLabel) }
        } else {
          return { ...prev, [questionIndex]: [...current, optionLabel] }
        }
      } else {
        return { ...prev, [questionIndex]: optionLabel }
      }
    })
    // Clear "Other" input if selecting a predefined option
    if (optionLabel !== 'Other') {
      setOtherInputs((prev) => ({ ...prev, [questionIndex]: '' }))
    }
  }

  const handleOtherInput = (questionIndex: number, value: string) => {
    setOtherInputs((prev) => ({ ...prev, [questionIndex]: value }))
    // Set "Other" as selected when typing
    setAnswers((prev) => {
      const q = question.questions[questionIndex]
      if (q.multiSelect) {
        const current = (prev[questionIndex] as string[]) || []
        if (!current.includes('Other')) {
          return { ...prev, [questionIndex]: [...current, 'Other'] }
        }
        return prev
      } else {
        return { ...prev, [questionIndex]: 'Other' }
      }
    })
  }

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      // Format answers for Claude - keyed by header
      const formattedAnswers: Record<string, string> = {}
      question.questions.forEach((q: Question, index: number) => {
        const answer = answers[index]
        const otherText = otherInputs[index]

        if (q.multiSelect) {
          const selectedLabels = (answer as string[]) || []
          const finalLabels = selectedLabels.map((label) =>
            label === 'Other' && otherText ? otherText : label
          )
          formattedAnswers[q.header] = finalLabels.join(', ')
        } else {
          if (answer === 'Other' && otherText) {
            formattedAnswers[q.header] = otherText
          } else {
            formattedAnswers[q.header] = (answer as string) || ''
          }
        }
      })

      // Send answers back to Claude via MCP
      await ipc.questions.respond(question.requestId, formattedAnswers)

      // Remove from pending
      removePendingQuestion(question.requestId)
    } catch (error) {
      console.error('Failed to submit answer:', error)
      setIsSubmitting(false)
    }
  }, [question, answers, otherInputs, isSubmitting, removePendingQuestion])

  // Check if at least one answer is provided for each question
  const isValid = useMemo(
    () => question.questions.every((q: Question, index: number) => isQuestionAnswered(q, index)),
    [question.questions, answers, otherInputs]
  )

  const getTargetQuestionIndex = () => {
    const firstIncomplete = question.questions.findIndex((q, index) => !isQuestionAnswered(q, index))
    if (firstIncomplete >= 0) return firstIncomplete
    return Math.min(activeQuestionIndex, question.questions.length - 1)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSubmitting) return
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null

      if (event.key === 'Enter') {
        if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return
        }
        if (isValid) {
          event.preventDefault()
          handleSubmit()
        }
        return
      }

      if (target && target.tagName === 'INPUT') {
        return
      }

      if (!/^\d$/.test(event.key)) return
      const selectedIndex = Number(event.key)
      if (!selectedIndex) return

      const qIndex = getTargetQuestionIndex()
      const q = question.questions[qIndex]
      const optionCount = q.options.length + 1
      if (selectedIndex > optionCount) return

      const label = selectedIndex === optionCount
        ? 'Other'
        : q.options[selectedIndex - 1].label

      handleOptionSelect(qIndex, label, q.multiSelect)
      setActiveQuestionIndex(qIndex)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [question.questions, answers, otherInputs, isSubmitting, isValid, activeQuestionIndex, handleSubmit])

  const timerUrgent = secondsLeft <= 30

  return (
    <div className="group flex w-full max-w-[95%] flex-col gap-2">
      <div className="flex w-fit max-w-full min-w-0 flex-col gap-3 text-sm">
        {/* Header */}
        <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400">
          <MessageCircleQuestion className="h-4 w-4 shrink-0" />
          <span className="font-medium">Claude is asking</span>
          {timerUrgent && (
            <span className={cn(
              "ml-auto text-xs font-mono tabular-nums",
              secondsLeft <= 10 ? "text-red-500 animate-pulse" : "text-pink-500"
            )}>
              {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, '0')}
            </span>
          )}
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {question.questions.map((q: Question, qIndex: number) => (
            <div
              key={qIndex}
              className={cn(
                "space-y-2 rounded-md p-2 transition-colors",
                qIndex === activeQuestionIndex ? "bg-muted/30" : "bg-transparent"
              )}
              onClick={() => setActiveQuestionIndex(qIndex)}
            >
              {/* Question header badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                  {q.header}
                </span>
              </div>

              {/* Question text */}
              <p className="text-sm text-foreground">{q.question}</p>

              {/* Options */}
              <div className="flex flex-wrap gap-2">
                {q.options.map((option: QuestionOption, oIndex: number) => {
                  const isSelected = q.multiSelect
                    ? ((answers[qIndex] as string[]) || []).includes(option.label)
                    : answers[qIndex] === option.label
                  const optionNumber = oIndex + 1

                  return (
                    <button
                      key={oIndex}
                      type="button"
                      onClick={() => handleOptionSelect(qIndex, option.label, q.multiSelect)}
                      className={cn(
                        'group relative px-3 py-1.5 rounded-md text-sm transition-all',
                        'border hover:border-primary/50',
                        isSelected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border/40 bg-background text-muted-foreground hover:bg-muted/30'
                      )}
                      title={option.description}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{optionNumber}</span>
                        {isSelected && <Check className="h-3 w-3 text-primary" />}
                        {option.label}
                      </span>
                    </button>
                  )
                })}

                {/* "Other" option */}
                {(() => {
                  const otherNumber = q.options.length + 1
                  const otherSelected = q.multiSelect
                    ? ((answers[qIndex] as string[]) || []).includes('Other')
                    : answers[qIndex] === 'Other'
                  return (
                    <button
                      type="button"
                      onClick={() => handleOptionSelect(qIndex, 'Other', q.multiSelect)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm transition-all',
                        'border hover:border-primary/50',
                        otherSelected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border/40 bg-background text-muted-foreground hover:bg-muted/30'
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{otherNumber}</span>
                        Other
                      </span>
                    </button>
                  )
                })()}
              </div>

              {/* "Other" text input */}
              {(q.multiSelect
                ? ((answers[qIndex] as string[]) || []).includes('Other')
                : answers[qIndex] === 'Other') && (
                <Input
                  placeholder="Enter your answer..."
                  value={otherInputs[qIndex] || ''}
                  onChange={(e) => handleOtherInput(qIndex, e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
              )}
            </div>
          ))}
        </div>

        {/* Submit button */}
        <Button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          size="sm"
          className="w-full"
        >
          {isSubmitting ? (
            'Sending...'
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send Answer
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
