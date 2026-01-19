import type { ToolCall } from '@/domain'
import { MessageResponse } from '@/components/ai-elements/message'
import { Map, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlanFileDisplayProps {
  tool: ToolCall
  isStreaming?: boolean
}

export function PlanFileDisplay({ tool, isStreaming = false }: PlanFileDisplayProps) {
  const filePath = (tool.input.file_path as string) || ''
  const content = (tool.input.content as string) || ''
  const fileName = filePath.split('/').pop() || 'plan.md'

  const isRunning = tool.status === 'pending' || tool.status === 'running'
  const hasContent = content.length > 0

  return (
    <div className="flex flex-col gap-2 w-full max-w-[95%]">
      {/* Header */}
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <Map className="h-4 w-4 shrink-0" />
        <span className="font-medium text-sm">Plan</span>
        <span className="text-xs text-muted-foreground">{fileName}</span>
        {isRunning && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
      </div>

      {/* Plan content - always visible, rendered as markdown */}
      {hasContent && (
        <div
          className={cn(
            "rounded-lg border bg-blue-500/5 border-blue-500/20 p-4",
            "max-h-[60vh] overflow-y-auto"
          )}
        >
          <MessageResponse
            className="text-sm prose-headings:text-base prose-headings:font-semibold"
          >
            {content}
          </MessageResponse>
        </div>
      )}
    </div>
  )
}
