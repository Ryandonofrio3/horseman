import { memo } from 'react'
import {
  Tool,
  ToolHeader,
  ToolContent,
} from '@/components/ai-elements/tool'
import type { ToolCall } from '@/domain'
import { CodeDisplay } from './CodeDisplay'
import { DiffDisplay } from './DiffDisplay'
import { SubagentDisplay } from './SubagentDisplay'
import { PlanFileDisplay } from './PlanFileDisplay'

/**
 * Strip Claude's line number format from Read tool output.
 * Format: "     1→\t" (space-padded number + arrow + optional tab)
 */
function stripClaudeLineNumbers(output: string): string {
  return output.replace(/^ *\d+→\t?/gm, '')
}

// Check if this is a plan file write (to ~/.claude/plans/)
function isPlanFileWrite(tool: ToolCall): boolean {
  if (tool.name !== 'Write') return false
  const filePath = tool.input.file_path as string | undefined
  return Boolean(filePath && filePath.includes('/.claude/plans/'))
}

interface ToolDisplayProps {
  tool: ToolCall
  isStreaming?: boolean
  allTools?: ToolCall[]  // All tools for SubagentDisplay child filtering
}

// Map our status to AI Elements state
function mapStatus(status: ToolCall['status']): 'input-streaming' | 'input-available' | 'output-available' | 'output-error' {
  switch (status) {
    case 'pending':
      return 'input-streaming'
    case 'running':
      return 'input-available'
    case 'completed':
      return 'output-available'
    case 'error':
      return 'output-error'
    default:
      return 'input-streaming'
  }
}

// Extract a preview string based on tool type
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
        return command.length > 50 ? command.slice(0, 50) + '...' : command
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

function ToolDisplayInner({ tool, isStreaming = false, allTools = [] }: ToolDisplayProps) {
  // Hide TodoWrite and EnterPlanMode - we have dedicated UI for them
  if (tool.name === 'TodoWrite' || tool.name === 'EnterPlanMode') return null

  // Plan file writes - render as special PlanFileDisplay (always visible, markdown rendered)
  if (isPlanFileWrite(tool)) {
    return <PlanFileDisplay tool={tool} isStreaming={isStreaming} />
  }

  // Task tool - render as SubagentDisplay with child tools
  if (tool.name === 'Task') {
    const childTools = allTools.filter((t) => t.parentToolId === tool.id)
    return (
      <SubagentDisplay
        tool={tool}
        childTools={childTools}
        allTools={allTools}
      />
    )
  }

  const state = mapStatus(tool.status)
  const preview = getToolPreview(tool)

  // Determine if we have content to show (output OR input data for Edit/Write)
  const hasContent = Boolean(tool.output) ||
    (tool.name === 'Edit' && tool.input.old_string !== undefined) ||
    (tool.name === 'Write' && Boolean(tool.input.content))

  // Edit and Write tools default open during live streaming, but closed for loaded history
  const defaultOpen = isStreaming && (tool.name === 'Edit' || tool.name === 'Write')

  return (
    <Tool defaultOpen={defaultOpen}>
      <ToolHeader
        title={tool.name}
        type={`tool-${tool.name.toLowerCase()}`}
        state={state}
        preview={preview}
      />
      <ToolContent>
        {hasContent && (
          <div className="p-2">
            <ToolOutputContent tool={tool} />
          </div>
        )}
      </ToolContent>
    </Tool>
  )
}

function ToolOutputContent({ tool }: { tool: ToolCall }) {
  // Edit tool - always show diff (even if strings are empty)
  if (tool.name === 'Edit') {
    const filePath = (tool.input.file_path as string) || 'file'
    const oldString = (tool.input.old_string as string) || ''
    const newString = (tool.input.new_string as string) || ''

    return (
      <DiffDisplay
        oldContent={oldString}
        newContent={newString}
        filename={filePath}
        className="max-h-96 overflow-auto rounded border border-border/40"
      />
    )
  }

  // Write tool - always show content with syntax highlighting
  if (tool.name === 'Write') {
    const filePath = (tool.input.file_path as string) || 'file'
    const content = (tool.input.content as string) || tool.output || ''

    return (
      <CodeDisplay
        code={content}
        filename={filePath}
        className="max-h-96 overflow-auto rounded border border-border/40"
      />
    )
  }

  if (!tool.output) return null

  // Read tool - show with syntax highlighting (strip Claude's line numbers)
  if (tool.name === 'Read') {
    const filePath = (tool.input.file_path as string) || 'file.txt'
    const code = stripClaudeLineNumbers(tool.output)

    return (
      <CodeDisplay
        code={code}
        filename={filePath}
        className="max-h-64 overflow-auto rounded border border-border/40"
      />
    )
  }

  // Bash tool - render in terminal style
  if (tool.name === 'Bash') {
    return (
      <div className="rounded border border-border/40 bg-zinc-950 p-3 font-mono text-xs text-zinc-100 overflow-x-auto max-h-64 overflow-y-auto">
        <pre className="whitespace-pre-wrap">{tool.output}</pre>
      </div>
    )
  }

  // Glob/Grep - show file paths or search results
  if (tool.name === 'Glob' || tool.name === 'Grep') {
    return (
      <div className="rounded border border-border/40 bg-muted/30 p-3 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
        <pre className="whitespace-pre-wrap">{tool.output}</pre>
      </div>
    )
  }

  // Default: render as plain text
  return (
    <div className="rounded border border-border/40 bg-muted/20 p-2 text-xs overflow-x-auto max-h-40 overflow-y-auto">
      <pre className="whitespace-pre-wrap font-mono">{tool.output}</pre>
    </div>
  )
}

export const ToolDisplay = memo(ToolDisplayInner, (prev, next) => {
  // Re-render only when relevant data changes
  if (prev.tool !== next.tool) return false
  if (prev.isStreaming !== next.isStreaming) return false

  // For Task tools, check if child tools changed
  if (prev.tool.name === 'Task') {
    const prevTools = prev.allTools ?? []
    const nextTools = next.allTools ?? []
    const prevChildCount = prevTools.filter(t => t.parentToolId === prev.tool.id).length
    const nextChildCount = nextTools.filter(t => t.parentToolId === next.tool.id).length
    if (prevChildCount !== nextChildCount) return false
  }
  return true
})
