import { Minimize2, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SlashCommandState = 'running' | 'completed' | 'error'

// Legacy export for backwards compat
export type CompactState = SlashCommandState

interface SlashCommandStatusProps {
  command: 'clear' | 'compact'
  state: SlashCommandState
  error?: string
}

const COMMAND_CONFIG = {
  clear: {
    icon: Trash2,
    running: 'Clearing conversation...',
    completed: 'Conversation cleared',
    error: 'Clear failed',
  },
  compact: {
    icon: Minimize2,
    running: 'Compacting conversation...',
    completed: 'Conversation compacted',
    error: 'Compact failed',
  },
}

export function SlashCommandStatus({ command, state, error }: SlashCommandStatusProps) {
  const config = COMMAND_CONFIG[command]

  return (
    <div className={cn(
      'flex items-center gap-2 px-4 py-3 rounded-lg border',
      state === 'running' && 'bg-muted/50 border-border',
      state === 'completed' && 'bg-green-500/10 border-green-500/30',
      state === 'error' && 'bg-destructive/10 border-destructive/30'
    )}>
      {state === 'running' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">{config.running}</span>
        </>
      )}
      {state === 'completed' && (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm text-green-600 dark:text-green-400">{config.completed}</span>
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error || config.error}</span>
        </>
      )}
    </div>
  )
}

// Legacy wrapper for backwards compat
interface CompactStatusProps {
  state: CompactState
  error?: string
}

export function CompactStatus({ state, error }: CompactStatusProps) {
  return <SlashCommandStatus command="compact" state={state} error={error} />
}
