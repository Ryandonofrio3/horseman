export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  content: string
  status: TodoStatus
  activeForm: string
}
