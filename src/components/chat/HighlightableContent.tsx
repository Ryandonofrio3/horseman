import { useRef, useEffect } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'

interface HighlightableContentProps {
  content: string
  searchQuery: string
  isMessageWithCurrentMatch: boolean
  isSearchActive: boolean
  currentMatchIndexInMessage?: number
}

/**
 * Renders markdown content via MessageResponse, then highlights search matches
 * in the DOM after render. This preserves markdown formatting while enabling search.
 *
 * Optimized: DOM structure only rebuilt when content/query changes.
 * Style updates (current match) are a separate cheap operation.
 */
export function HighlightableContent({
  content,
  searchQuery,
  isMessageWithCurrentMatch,
  isSearchActive,
  currentMatchIndexInMessage,
}: HighlightableContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastQueryRef = useRef<string>('')

  // Effect 1: Build/rebuild highlight marks (expensive - only when content/query changes)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const query = searchQuery.trim().toLowerCase()

    // Clear previous highlights
    const existingMarks = container.querySelectorAll('mark[data-search-highlight]')
    existingMarks.forEach((mark) => {
      const parent = mark.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      }
    })

    lastQueryRef.current = query
    if (!query) return

    let globalMatchIndex = 0

    // Walk through all text nodes and highlight matches
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
    const textNodes: Text[] = []

    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      textNodes.push(node)
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent || ''
      const textLower = text.toLowerCase()

      const matches: { start: number; end: number }[] = []
      let searchStart = 0

      while (true) {
        const index = textLower.indexOf(query, searchStart)
        if (index === -1) break
        matches.push({ start: index, end: index + query.length })
        searchStart = index + 1
      }

      if (matches.length === 0) continue

      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      for (const match of matches) {
        if (match.start > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.start)))
        }

        const mark = document.createElement('mark')
        mark.setAttribute('data-search-highlight', 'true')
        mark.setAttribute('data-match-index', String(globalMatchIndex))
        mark.textContent = text.slice(match.start, match.end)
        mark.style.borderRadius = '2px'
        mark.style.padding = '0 2px'
        fragment.appendChild(mark)

        lastIndex = match.end
        globalMatchIndex++
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
      }

      textNode.parentNode?.replaceChild(fragment, textNode)
    }
  }, [content, searchQuery])

  // Effect 2: Update mark styles (cheap - runs when current match changes)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !lastQueryRef.current) return

    const marks = container.querySelectorAll('mark[data-search-highlight]')
    marks.forEach((mark) => {
      const matchIndex = parseInt(mark.getAttribute('data-match-index') || '-1', 10)
      const isTheCurrentMatch = isMessageWithCurrentMatch && matchIndex === currentMatchIndexInMessage

      const el = mark as HTMLElement
      el.style.backgroundColor = isSearchActive
        ? isTheCurrentMatch
          ? '#facc15' // yellow-400 - current match
          : '#fef08a' // yellow-200 - other matches
        : 'transparent'
      el.style.color = isSearchActive ? '#000' : 'inherit'
    })
  }, [isMessageWithCurrentMatch, isSearchActive, currentMatchIndexInMessage])

  return (
    <div ref={containerRef}>
      <MessageResponse>{content}</MessageResponse>
    </div>
  )
}
