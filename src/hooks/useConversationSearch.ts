import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ParsedMessage } from '@/domain'

interface SearchMatch {
  messageId: string
  messageIndex: number
  matchIndex: number // Which match within the message
  startOffset: number
  endOffset: number
}

export function useConversationSearch(messages: ParsedMessage[]) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Calculate all matches when search query changes
  const matches = useMemo(() => {
    if (!searchQuery.trim()) return []

    const query = searchQuery.toLowerCase()
    const results: SearchMatch[] = []

    messages.forEach((message, messageIndex) => {
      // Only search user and assistant messages with content
      if (message.role === 'system' || !message.text) return

      const content = message.text.toLowerCase()
      let searchStart = 0
      let matchIndex = 0

      while (true) {
        const index = content.indexOf(query, searchStart)
        if (index === -1) break

        results.push({
          messageId: message.id,
          messageIndex,
          matchIndex,
          startOffset: index,
          endOffset: index + query.length,
        })

        searchStart = index + 1
        matchIndex++
      }
    })

    return results
  }, [messages, searchQuery])

  // Current match (1-indexed for display)
  const currentMatch = matches.length > 0 ? currentMatchIndex + 1 : 0
  const totalMatches = matches.length

  // Get current match details
  const currentMatchDetails = matches[currentMatchIndex] || null

  // Navigate to next match
  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length)
  }, [matches.length])

  // Navigate to previous match
  const goToPrevMatch = useCallback(() => {
    if (matches.length === 0) return
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length)
  }, [matches.length])

  // Reset match index when query changes
  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [searchQuery])

  // Handle keyboard shortcut (Ctrl+F / Cmd+F) - toggles search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close search (keep query for highlights to prevent scroll jump)
  const closeSearch = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Open search
  const openSearch = useCallback(() => {
    setIsOpen(true)
  }, [])

  return {
    isOpen,
    searchQuery,
    setSearchQuery,
    currentMatch,
    totalMatches,
    currentMatchDetails,
    goToNextMatch,
    goToPrevMatch,
    closeSearch,
    openSearch,
    matches,
  }
}
