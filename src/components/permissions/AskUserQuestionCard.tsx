import { useEffect, useMemo, useState, useCallback, useReducer } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PendingQuestion, Question, QuestionOption } from '@/store/types'
import { useStore } from '@/store'
import { MessageCircleQuestion, Check, Send } from 'lucide-react'
import { ipc } from '@/lib/ipc'

interface AskUserQuestionCardProps {
  question: PendingQuestion
  queueTotal?: number
}

interface FormState {
  answers: Record<number, string | string[]>
  otherInputs: Record<number, string>
  isSubmitting: boolean
  activeQuestionIndex: number
}

type FormAction =
  | { type: 'SET_ANSWER'; questionIndex: number; value: string | string[] }
  | { type: 'SET_OTHER_INPUT'; questionIndex: number; value: string }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_ACTIVE_QUESTION'; index: number }
  | { type: 'RESET' }

const initialFormState: FormState = {
  answers: {},
  otherInputs: {},
  isSubmitting: false,
  activeQuestionIndex: 0,
}

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_ANSWER':
      return { ...state, answers: { ...state.answers, [action.questionIndex]: action.value } }
    case 'SET_OTHER_INPUT':
      return { ...state, otherInputs: { ...state.otherInputs, [action.questionIndex]: action.value } }
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.value }
    case 'SET_ACTIVE_QUESTION':
      return { ...state, activeQuestionIndex: action.index }
    case 'RESET':
      return initialFormState
    default:
      return state
  }
}

export function AskUserQuestionCard({ question, queueTotal = 1 }: AskUserQuestionCardProps) {
  const removePendingQuestion = useStore((s) => s.removePendingQuestion)

  // Debug: Log if questions array is empty or malformed
  useEffect(() => {
    if (!question.questions || question.questions.length === 0) {
      console.error('[AskUserQuestionCard] Empty questions array!', {
        requestId: question.requestId,
        sessionId: question.sessionId,
        toolUseId: question.toolUseId,
        questionsRaw: question.questions,
      })
    } else {
      console.log('[AskUserQuestionCard] Rendering', question.questions.length, 'questions')
    }
  }, [question])

  // Form state via reducer
  // For single select: { questionIndex: optionLabel }
  // For multi select: { questionIndex: [optionLabel1, optionLabel2] }
  const [formState, dispatch] = useReducer(formReducer, initialFormState)
  const { answers, otherInputs, isSubmitting, activeQuestionIndex } = formState

  // Timer kept separate (high-frequency updates)
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
    // Always remove from store first - the backend request may have already timed out
    removePendingQuestion(question.requestId)
    try {
      await ipc.permissions.respond(question.requestId, false, {
        message: 'Timed out waiting for answer',
      })
    } catch (err) {
      // Expected if backend already timed out - question is already removed
      console.log('[AskUserQuestionCard] Timeout response failed (likely already expired):', err)
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

  const handleOptionSelect = useCallback((questionIndex: number, optionLabel: string, multiSelect: boolean) => {
    // Compute the new answer value
    let newValue: string | string[]
    if (multiSelect) {
      const current = (answers[questionIndex] as string[]) || []
      if (current.includes(optionLabel)) {
        newValue = current.filter((l) => l !== optionLabel)
      } else {
        newValue = [...current, optionLabel]
      }
    } else {
      newValue = optionLabel
    }
    dispatch({ type: 'SET_ANSWER', questionIndex, value: newValue })

    // Clear "Other" input if selecting a predefined option
    if (optionLabel !== 'Other') {
      dispatch({ type: 'SET_OTHER_INPUT', questionIndex, value: '' })
    }
  }, [answers])

  const handleOtherInput = useCallback((questionIndex: number, value: string) => {
    dispatch({ type: 'SET_OTHER_INPUT', questionIndex, value })
    // Set "Other" as selected when typing
    const q = question.questions[questionIndex]
    if (q.multiSelect) {
      const current = (answers[questionIndex] as string[]) || []
      if (!current.includes('Other')) {
        dispatch({ type: 'SET_ANSWER', questionIndex, value: [...current, 'Other'] })
      }
    } else {
      dispatch({ type: 'SET_ANSWER', questionIndex, value: 'Other' })
    }
  }, [question.questions, answers])

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return
    dispatch({ type: 'SET_SUBMITTING', value: true })

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
      dispatch({ type: 'SET_SUBMITTING', value: false })
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

  // Extracted click handlers using data attributes
  const handleQuestionContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const index = Number(e.currentTarget.dataset.questionIndex)
    dispatch({ type: 'SET_ACTIVE_QUESTION', index })
  }, [])

  const handleOptionClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const questionIndex = Number(e.currentTarget.dataset.questionIndex)
    const optionLabel = e.currentTarget.dataset.optionLabel!
    const multiSelect = e.currentTarget.dataset.multiSelect === 'true'
    handleOptionSelect(questionIndex, optionLabel, multiSelect)
  }, [handleOptionSelect])

  const handleOtherInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const questionIndex = Number(e.currentTarget.dataset.questionIndex)
    handleOtherInput(questionIndex, e.target.value)
  }, [handleOtherInput])

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
      dispatch({ type: 'SET_ACTIVE_QUESTION', index: qIndex })
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
          {queueTotal > 1 && (
            <span className="text-xs text-muted-foreground">(1 of {queueTotal})</span>
          )}
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
          {(!question.questions || question.questions.length === 0) ? (
            <p className="text-sm text-muted-foreground italic">
              No questions received. Check console for details.
            </p>
          ) : question.questions.map((q: Question, qIndex: number) => (
            <div
              key={qIndex}
              data-question-index={qIndex}
              className={cn(
                "space-y-2 rounded-md p-2 transition-colors",
                qIndex === activeQuestionIndex ? "bg-muted/30" : "bg-transparent"
              )}
              onClick={handleQuestionContainerClick}
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
                      data-question-index={qIndex}
                      data-option-label={option.label}
                      data-multi-select={q.multiSelect}
                      onClick={handleOptionClick}
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
                      data-question-index={qIndex}
                      data-option-label="Other"
                      data-multi-select={q.multiSelect}
                      onClick={handleOptionClick}
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
                  data-question-index={qIndex}
                  onChange={handleOtherInputChange}
                  className="h-8 text-sm"
                  autoFocus
                />
              )}
            </div>
          ))}
        </div>

        {/* Submit button or Dismiss if expired */}
        {secondsLeft <= 0 ? (
          <Button
            onClick={() => removePendingQuestion(question.requestId)}
            variant="outline"
            size="sm"
            className="w-full"
          >
            Dismiss (Expired)
          </Button>
        ) : (
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
        )}
      </div>
    </div>
  )
}
