/**
 * InlineFileRef - File reference display for messages
 *
 * Renders @path references as clean, expandable cards.
 * Shown outside message bubble, similar to FileBlockDisplay.
 */
import { useState, useEffect, useMemo, memo } from 'react'
import { ChevronDown, ChevronRight, FileCode, Loader2 } from 'lucide-react'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { CodeDisplay } from './CodeDisplay'
import { cn } from '@/lib/utils'

interface FileRefDisplayProps {
  path: string
  workingDirectory?: string
}

export const FileRefDisplay = memo(function FileRefDisplay({
  path,
  workingDirectory,
}: FileRefDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullPath = useMemo(() => {
    if (path.startsWith('/')) return path
    return workingDirectory ? `${workingDirectory}/${path}` : path
  }, [path, workingDirectory])

  useEffect(() => {
    if (!isExpanded || content !== null) return

    setIsLoading(true)
    setError(null)

    readTextFile(fullPath)
      .then(setContent)
      .catch((err) => {
        console.error('Failed to read file:', fullPath, err)
        setError('Could not read file')
      })
      .finally(() => setIsLoading(false))
  }, [isExpanded, fullPath, content])

  const lineCount = content?.split('\n').length ?? 0

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-muted/50',
          isExpanded && 'border-b'
        )}
      >
        <div className="shrink-0 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>

        <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />

        <code className="text-sm font-mono truncate flex-1">{path}</code>

        {lineCount > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {lineCount} lines
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="max-h-80 overflow-auto">
          {error ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">{error}</div>
          ) : isLoading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading file...
            </div>
          ) : content ? (
            <CodeDisplay code={content} filename={path} />
          ) : null}
        </div>
      )}
    </div>
  )
})

/**
 * Extract @file references from text
 * Returns the cleaned text and list of file paths
 */
export function extractFileRefs(text: string): { cleanText: string; filePaths: string[] } {
  const filePaths: string[] = []

  // Match @path patterns - preceded by start or whitespace, followed by end or whitespace
  const pattern = /(?:^|\s)@([\w./-]+)(?=\s|$)/gm

  const cleanText = text.replace(pattern, (match, path) => {
    filePaths.push(path)
    // Keep the leading whitespace if any, remove the @path
    return match.startsWith(' ') || match.startsWith('\n') ? ' ' : ''
  }).trim()

  return { cleanText, filePaths }
}
