import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, ChevronRight, Circle, Loader2 } from 'lucide-react'
import type { TodoItem } from '@/domain'

export interface TodoListProps {
  todos: TodoItem[]
  className?: string
  defaultExpanded?: boolean
}

export function TodoList({ todos, className, defaultExpanded = false }: TodoListProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  if (!todos || todos.length === 0) return null

  // Hide when all tasks complete
  if (todos.every((t) => t.status === 'completed')) return null

  const completedCount = todos.filter((t) => t.status === 'completed').length
  const inProgressTask = todos.find((t) => t.status === 'in_progress')
  const total = todos.length

  return (
    <div className={cn('shrink-0 border-t border-border bg-muted/30 px-4 py-2', className)}>
      <div className="mx-auto max-w-3xl text-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 text-left hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors"
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
        <span className="font-medium">Todos:</span>
        <span className="text-muted-foreground">
          {completedCount}/{total}
        </span>
        {inProgressTask && !isExpanded && (
          <>
            <span className="text-muted-foreground">·</span>
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />
            <span className="truncate text-muted-foreground">
              {inProgressTask.activeForm}
            </span>
          </>
        )}
      </button>

      {/* Expanded list */}
      {isExpanded && (
        <div className="mt-2 space-y-1.5 pl-6">
          {todos.map((todo, index) => (
            <div
              key={`${todo.content}-${index}`}
              className="flex items-center gap-2"
            >
              {todo.status === 'completed' && (
                <Check className="h-4 w-4 shrink-0 text-green-500" />
              )}
              {todo.status === 'in_progress' && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
              )}
              {todo.status === 'pending' && (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  'leading-tight',
                  todo.status === 'completed' && 'text-muted-foreground line-through',
                  todo.status === 'in_progress' && 'text-foreground font-medium'
                )}
              >
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
