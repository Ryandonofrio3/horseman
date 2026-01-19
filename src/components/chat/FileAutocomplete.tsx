/**
 * FileAutocomplete - Dropdown for @ file references
 *
 * Shows matching files when user types @ in the input.
 * Uses command palette style for keyboard navigation.
 * Renders via portal to escape overflow-hidden containers.
 *
 * Perf: Debounces IPC calls to avoid thrashing on fast typing.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Folder } from 'lucide-react'
import { ipc, FileEntry } from '@/lib/ipc'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 150

interface FileAutocompleteProps {
  workingDirectory: string
  query: string
  position: { top: number; left: number } | null
  selectedIndex: number
  onSelect: (filePath: string, isDir: boolean) => void
  onClose: () => void
  onFilesChange: (count: number) => void
  onSelectionChange?: (file: FileEntry | null) => void
}

export function FileAutocomplete({
  workingDirectory,
  query,
  position,
  selectedIndex,
  onSelect,
  onClose,
  onFilesChange,
  onSelectionChange,
}: FileAutocompleteProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch files when query changes (debounced)
  useEffect(() => {
    let cancelled = false

    // Clear pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Show loading immediately for feedback
    setIsLoading(true)

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await ipc.files.glob(workingDirectory, query, 15)
        if (!cancelled) {
          setFiles(results)
          onFilesChange(results.length)
        }
      } catch (e) {
        console.error('Failed to glob files:', e)
        if (!cancelled) {
          setFiles([])
          onFilesChange(0)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [workingDirectory, query, onFilesChange])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const items = listRef.current.querySelectorAll('[data-file-item]')
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Notify parent of selection change
  useEffect(() => {
    onSelectionChange?.(files[selectedIndex] ?? null)
  }, [files, selectedIndex, onSelectionChange])

  const handleSelect = useCallback((file: FileEntry) => {
    onSelect(file.path, file.is_dir)
  }, [onSelect])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-file-autocomplete]')) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const dropdownStyle = useMemo(() => ({
    top: position ? position.top - 8 : 0,
    left: position?.left ?? 0,
    transform: 'translateY(-100%)' as const,
  }), [position?.top, position?.left])

  if (!position) return null

  const dropdown = (
    <div
      data-file-autocomplete
      className={cn(
        'fixed z-50 w-96 max-h-64 overflow-auto',
        'bg-popover border rounded-lg shadow-lg'
      )}
      style={dropdownStyle}
      ref={listRef}
    >
      {isLoading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Searching...
        </div>
      ) : files.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {query ? 'No files found' : 'Type to search files'}
        </div>
      ) : (
        <div className="py-1">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Files matching "{query || '...'}"
          </div>
          {files.map((file, index) => (
            <div
              key={file.path}
              data-file-item
              onClick={() => handleSelect(file)}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm',
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
            >
              {file.is_dir ? (
                <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{file.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return createPortal(dropdown, document.body)
}
