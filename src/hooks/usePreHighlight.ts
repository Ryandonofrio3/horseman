/**
 * usePreHighlight - Trigger syntax highlighting on hover before content is shown
 *
 * Starts worker-based highlighting when user hovers, so by the time they
 * click to expand, the highlighted result is cached and renders instantly.
 */
import { useCallback, useRef, useState, useEffect } from 'react'
import { useWorkerPool } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'

interface UsePreHighlightReturn {
  isReady: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  triggerHighlight: () => void
  cacheKey: string | null
}

export function usePreHighlight(
  filename: string,
  content: string | null
): UsePreHighlightReturn {
  const workerPool = useWorkerPool()
  const [isReady, setIsReady] = useState(false)
  const triggeredRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef(content)

  const cacheKey = content ? `${filename}:${content.length}` : null

  // Reset when content changes
  useEffect(() => {
    if (content !== contentRef.current) {
      contentRef.current = content
      triggeredRef.current = false
      setIsReady(false)
    }
  }, [content])

  const triggerHighlight = useCallback(() => {
    if (!workerPool || !content || triggeredRef.current) return
    triggeredRef.current = true

    const file: FileContents = {
      name: filename,
      contents: content,
      cacheKey: cacheKey!,
    }

    // Check cache first
    if (workerPool.getFileResultCache(file)) {
      setIsReady(true)
      return
    }

    // Trigger async highlight with stub instance
    workerPool.highlightFileAST(
      {
        onHighlightSuccess: () => setIsReady(true),
        onHighlightError: () => setIsReady(true), // Still allow showing on error
      },
      file
    )
  }, [workerPool, content, filename, cacheKey])

  const onMouseEnter = useCallback(() => {
    if (triggeredRef.current) return
    // 80ms debounce to avoid triggering on accidental hover-through
    debounceRef.current = setTimeout(triggerHighlight, 80)
  }, [triggerHighlight])

  const onMouseLeave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return { isReady, onMouseEnter, onMouseLeave, triggerHighlight, cacheKey }
}
