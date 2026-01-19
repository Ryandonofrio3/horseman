/**
 * FileBlockDisplay - Collapsible file display in messages
 *
 * Read-only version of FilePill for displaying pasted files in message history.
 * Default collapsed, expandable to show full content with syntax highlighting.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { CodeDisplay } from './CodeDisplay'
import type { FileBlock } from '@/domain'
import { cn } from '@/lib/utils'

interface FileBlockDisplayProps {
  file: FileBlock
  defaultExpanded?: boolean
  className?: string
}

export function FileBlockDisplay({
  file,
  defaultExpanded = false,
  className,
}: FileBlockDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Get a filename for syntax highlighting
  const displayName = file.name || 'Pasted text'
  const filename = file.language ? `file.${file.language}` : 'file.txt'

  return (
    <div
      className={cn(
        'border rounded-lg bg-muted/30 overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button
          type="button"
          className="p-0.5 hover:bg-muted rounded"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

        <span className="text-sm font-medium truncate flex-1">
          {displayName}
        </span>

        <span className="text-xs text-muted-foreground">
          {file.lineCount} {file.lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t max-h-96 overflow-auto">
          <CodeDisplay
            code={file.content}
            filename={filename}
          />
        </div>
      )}

      {/* Collapsed preview - first 3 lines */}
      {!isExpanded && file.lineCount > 0 && (
        <div className="border-t px-3 py-1.5 bg-muted/20">
          <pre className="text-xs text-muted-foreground font-mono truncate">
            {file.content.split('\n').slice(0, 2).join('\n')}
            {file.lineCount > 2 && '\n...'}
          </pre>
        </div>
      )}
    </div>
  )
}
