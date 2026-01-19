import type { ToolCall } from '@/domain'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChildToolDisplayProps {
  tool: ToolCall
}

// Get a preview string based on tool type
function getToolPreview(tool: ToolCall): string | undefined {
  const { name, input } = tool

  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write': {
      const filePath = input.file_path as string | undefined
      if (filePath) {
        const parts = filePath.split('/')
        return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : filePath
      }
      return undefined
    }
    case 'Bash': {
      const command = input.command as string | undefined
      if (command) {
        return command.length > 40 ? command.slice(0, 40) + '...' : command
      }
      return undefined
    }
    case 'Glob':
    case 'Grep': {
      const pattern = input.pattern as string | undefined
      return pattern ? `"${pattern}"` : undefined
    }
    case 'WebFetch': {
      const url = input.url as string | undefined
      if (url) {
        try {
          const parsed = new URL(url)
          return parsed.hostname
        } catch {
          return url.slice(0, 30) + '...'
        }
      }
      return undefined
    }
    case 'WebSearch': {
      const query = input.query as string | undefined
      return query ? `"${query}"` : undefined
    }
    default:
      return undefined
  }
}

function StatusIcon({ status }: { status: ToolCall['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-3 w-3 text-muted-foreground" />
    case 'running':
      return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
    case 'completed':
      return <CheckCircle2 className="h-3 w-3 text-green-500" />
    case 'error':
      return <XCircle className="h-3 w-3 text-red-500" />
    case 'awaiting_input':
      return <Clock className="h-3 w-3 text-yellow-500" />
    default:
      return <Clock className="h-3 w-3 text-muted-foreground" />
  }
}

export function ChildToolDisplay({ tool }: ChildToolDisplayProps) {
  const preview = getToolPreview(tool)
  const isRunning = tool.status === 'running'
  const isError = tool.status === 'error'

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 text-sm rounded",
        "bg-muted/20 border border-border/30",
        isRunning && "border-blue-500/30",
        isError && "border-red-500/30"
      )}
    >
      <StatusIcon status={tool.status} />
      <span
        className={cn(
          "font-medium text-xs",
          isRunning && "text-blue-500",
          isError && "text-red-500",
          !isRunning && !isError && "text-foreground"
        )}
      >
        {tool.name}
      </span>
      {preview && (
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {preview}
        </span>
      )}
    </div>
  )
}
