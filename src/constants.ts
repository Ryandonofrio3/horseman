// Status indicator colors for sessions
export const STATUS_COLORS = {
  idle: 'bg-muted-foreground/30',
  running: 'bg-green-500',
  waiting_permission: 'bg-yellow-500',
  waiting_question: 'bg-blue-500',
  error: 'bg-destructive',
} as const
