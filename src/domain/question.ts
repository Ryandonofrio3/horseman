export interface QuestionOption {
  label: string
  description: string
}

export interface Question {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

export interface PendingQuestion {
  requestId: string
  sessionId: string
  toolUseId: string
  questions: Question[]
  timestamp: number
}
