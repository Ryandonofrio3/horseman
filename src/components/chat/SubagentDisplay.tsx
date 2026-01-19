import { memo, useEffect, useMemo, useState } from 'react'
import type { ToolCall } from '@/domain'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Loader2, CheckCircle2, XCircle, ChevronRight, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChildToolDisplay } from './ChildToolDisplay'

interface SubagentDisplayProps {
  tool: ToolCall
  childTools?: ToolCall[]
  allTools?: ToolCall[]
}

// Map subagent types to display-friendly names
const SUBAGENT_LABELS: Record<string, string> = {
  'Explore': 'Explore',
  'Plan': 'Plan',
  'Bash': 'Bash',
  'general-purpose': 'Agent',
  'claude-code-guide': 'Guide',
  'statusline-setup': 'Setup',
}

function SubagentDisplayInner({ tool, childTools = [], allTools = [] }: SubagentDisplayProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { subagent } = tool

  const subagentType = subagent?.type || 'Task'
  const displayLabel = SUBAGENT_LABELS[subagentType] || subagentType
  const description = subagent?.description || 'Working...'
  const toolCount = childTools.length || subagent?.toolCount || 0

  const isRunning = tool.status === 'pending' || tool.status === 'running'
  const isCompleted = tool.status === 'completed'
  const isError = tool.status === 'error'
  const hasAwaitingChildQuestion = childTools.some(
    (child) => child.name === 'AskUserQuestion' && child.status === 'awaiting_input'
  )

  useEffect(() => {
    if (!hasAwaitingChildQuestion) return
    setIsOpen(true)
  }, [hasAwaitingChildQuestion])

  // Compute elapsed time lazily - updates when tool.startedAt/endedAt change
  // For running tasks, shows snapshot (doesn't tick every second)
  const elapsedMs = useMemo(() => {
    if (!tool.startedAt) return null
    const start = Date.parse(tool.startedAt)
    const end = tool.endedAt ? Date.parse(tool.endedAt) : Date.now()
    return Math.max(0, end - start)
  }, [tool.startedAt, tool.endedAt])

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  }

  const elapsedLabel = elapsedMs !== null ? formatElapsed(elapsedMs) : null

  // Only show chevron if there are child tools or output
  const hasExpandableContent = childTools.length > 0 || tool.output

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg",
            "border border-border/40 bg-card/50",
            "hover:bg-muted/30 transition-colors text-left",
            hasExpandableContent && "cursor-pointer",
            !hasExpandableContent && "cursor-default"
          )}
        >
          {/* Chevron - only show if expandable */}
          {hasExpandableContent ? (
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-90"
              )}
            />
          ) : (
            <div className="w-3.5" />
          )}

          {/* Bot icon with status color */}
          <Bot
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isRunning && "text-blue-500",
              isCompleted && "text-green-500",
              isError && "text-red-500"
            )}
          />

          {/* Subagent type */}
          <span
            className={cn(
              "font-medium",
              isRunning && "text-blue-500",
              isCompleted && "text-foreground",
              isError && "text-red-500"
            )}
          >
            {displayLabel}
          </span>

          {/* Description */}
          <span className="text-muted-foreground truncate flex-1 min-w-0">
            {description}
          </span>

          {/* Tool count - shows (N tools) */}
          {toolCount > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              ({toolCount} {toolCount === 1 ? 'tool' : 'tools'})
            </span>
          )}

          {/* Elapsed time */}
          {elapsedLabel && (
            <span className="text-xs text-muted-foreground shrink-0">
              {elapsedLabel}
            </span>
          )}

          {/* Status indicator */}
          <div className="shrink-0 ml-1">
            {isRunning && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            )}
            {isCompleted && (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            )}
            {isError && (
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-6 mt-1 space-y-1 border-l-2 border-border/40 pl-3">
          {/* Render child tools */}
          {childTools.map((childTool) => {
            // Check if this child is itself a Task (nested subagent)
            if (childTool.name === 'Task') {
              const nestedChildren = allTools.filter((t) => t.parentToolId === childTool.id)
              return (
                <SubagentDisplay
                  key={childTool.id}
                  tool={childTool}
                  childTools={nestedChildren}
                  allTools={allTools}
                />
              )
            }
            return <ChildToolDisplay key={childTool.id} tool={childTool} />
          })}

          {/* Show output if present and no child tools */}
          {tool.output && childTools.length === 0 && (
            <div className="py-2">
              <div className="text-xs text-muted-foreground mb-1 font-medium">
                Result
              </div>
              <div className="max-h-48 overflow-auto rounded-md bg-muted/30 border border-border/40 p-2">
                <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                  {tool.output}
                </pre>
              </div>
            </div>
          )}

          {/* Show agent ID if present */}
          {subagent?.agentId && (
            <div className="py-1 text-xs text-muted-foreground">
              ID: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{subagent.agentId}</code>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const SubagentDisplay = memo(SubagentDisplayInner, (prev, next) => {
  if (prev.tool !== next.tool) return false
  if (prev.childTools.length !== next.childTools.length) return false
  for (let i = 0; i < prev.childTools.length; i++) {
    if (prev.childTools[i] !== next.childTools[i]) return false
  }
  return true
})
