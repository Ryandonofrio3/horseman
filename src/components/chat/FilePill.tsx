/**
 * FilePill - Compact expandable pill for pending file attachments
 *
 * Both reference (@file) and pasted content are expandable with syntax highlighting.
 * Reference files lazily load content on expand.
 */
import { useState, useMemo, memo, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, X, FileText, AtSign, Loader2, Folder } from 'lucide-react'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { CodeDisplay } from './CodeDisplay'
import { usePreHighlight } from '@/hooks/usePreHighlight'
import type { PendingFile } from '@/domain'
import { cn } from '@/lib/utils'

interface FilePillProps {
  file: PendingFile
  workingDirectory?: string
  onRemove: (id: string) => void
  className?: string
}

export const FilePill = memo(function FilePill({
  file,
  workingDirectory,
  onRemove,
  className
}: FilePillProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // For references: lazily loaded content
  const [loadedContent, setLoadedContent] = useState<string | null>(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Construct full path for references
  const fullPath = useMemo(() => {
    if (!file.isReference || !file.path) return null
    if (file.path.startsWith('/')) return file.path
    return workingDirectory ? `${workingDirectory}/${file.path}` : file.path
  }, [file.isReference, file.path, workingDirectory])

  // Determine content and metadata
  const content = file.isReference ? loadedContent : file.content
  const lineCount = file.isReference
    ? (loadedContent?.split('\n').length ?? 0)
    : file.lineCount

  // Display just filename for references, full name for pastes
  const displayName = file.isReference
    ? (file.path?.split('/').pop() || file.path)
    : (file.name || 'Pasted text')

  const filename = file.path || (file.language ? `file.${file.language}` : 'file.txt')

  // Pre-highlight on hover
  const {
    isReady: isHighlightReady,
    onMouseEnter: onHighlightMouseEnter,
    onMouseLeave: onHighlightMouseLeave,
    triggerHighlight,
    cacheKey,
  } = usePreHighlight(filename, content)

  // Pre-load file content on hover for references
  const handleMouseEnter = useCallback(() => {
    onHighlightMouseEnter()

    // For references: start loading file content on hover
    if (file.isReference && !file.isDirectory && fullPath && loadedContent === null && !isLoadingContent) {
      setIsLoadingContent(true)
      setLoadError(null)
      readTextFile(fullPath)
        .then((fileContent) => {
          setLoadedContent(fileContent)
        })
        .catch((err) => {
          console.error('Failed to read file:', fullPath, err)
          setLoadError('Failed to read file')
        })
        .finally(() => {
          setIsLoadingContent(false)
        })
    }
  }, [onHighlightMouseEnter, file.isReference, file.isDirectory, fullPath, loadedContent, isLoadingContent])

  // Trigger highlight when content becomes available (for references)
  useEffect(() => {
    if (content && !isHighlightReady) {
      triggerHighlight()
    }
  }, [content, isHighlightReady, triggerHighlight])

  // Memoize collapsed preview
  const collapsedPreview = useMemo(() => {
    if (!content || lineCount <= 0) return null
    const lines = content.split('\n').slice(0, 3).join('\n')
    return lineCount > 3 ? lines + '\n...' : lines
  }, [content, lineCount])

  // Pick icon: folder for directories, @ for file references, file for pastes
  const Icon = file.isDirectory ? Folder : file.isReference ? AtSign : FileText
  const canExpand = !file.isDirectory // Directories can't be expanded

  return (
    <div className={cn(
      'border rounded-md bg-background overflow-hidden min-w-48 max-w-md',
      isExpanded && canExpand && 'min-w-72',
      className
    )}>
      {/* Header - always visible */}
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 transition-colors',
          canExpand && 'cursor-pointer hover:bg-muted/50',
          isExpanded && canExpand && 'border-b bg-muted/30'
        )}
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        onMouseEnter={canExpand ? handleMouseEnter : undefined}
        onMouseLeave={canExpand ? onHighlightMouseLeave : undefined}
      >
        {/* Only show chevron for expandable items */}
        {canExpand && (
          isLoadingContent ? (
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
          ) : isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        )}

        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <span className="text-xs font-medium truncate flex-1">
          {displayName}
        </span>

        {(lineCount > 0 || !file.isReference) && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {lineCount > 0 ? `${lineCount}L` : ''}
          </span>
        )}

        <button
          type="button"
          className="p-0.5 hover:bg-destructive/20 hover:text-destructive rounded transition-colors"
          onClick={(e) => { e.stopPropagation(); onRemove(file.id) }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Expanded content - only for files, not directories */}
      {isExpanded && canExpand && (
        <div className="max-h-48 overflow-auto">
          {loadError ? (
            <div className="px-3 py-2 text-xs text-destructive">{loadError}</div>
          ) : isLoadingContent || (content && !isHighlightReady) ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isLoadingContent ? 'Loading...' : 'Highlighting...'}
            </div>
          ) : content ? (
            <CodeDisplay code={content} filename={filename} cacheKey={cacheKey ?? undefined} />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">No content</div>
          )}
        </div>
      )}

      {/* Collapsed preview - only for non-references with content */}
      {!isExpanded && !file.isReference && collapsedPreview && (
        <div className="px-2 py-1 bg-muted/20 border-t">
          <pre className="text-[10px] text-muted-foreground font-mono line-clamp-2 whitespace-pre-wrap">
            {collapsedPreview}
          </pre>
        </div>
      )}
    </div>
  )
})
