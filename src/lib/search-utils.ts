import React from 'react'

/**
 * Highlight search matches in text content
 * Returns React nodes with <mark> elements for matches
 */
export function highlightSearchMatches(
  content: string,
  searchQuery: string,
  isMessageWithCurrentMatch: boolean,
  isSearchActive: boolean = true,
  currentMatchIndexInMessage?: number
): React.ReactNode {
  if (!searchQuery.trim()) return content

  const parts: React.ReactNode[] = []
  const query = searchQuery.toLowerCase()
  const contentLower = content.toLowerCase()
  let lastIndex = 0
  let matchIndex = 0

  while (true) {
    const index = contentLower.indexOf(query, lastIndex)
    if (index === -1) break

    // Add text before match
    if (index > lastIndex) {
      parts.push(content.slice(lastIndex, index))
    }

    // Check if this specific match is THE current match
    const isTheCurrentMatch = isMessageWithCurrentMatch && matchIndex === currentMatchIndexInMessage

    // Add highlighted match - use inline styles to avoid Tailwind purging
    // Use data attribute for scrolling to current match
    parts.push(
      React.createElement('mark', {
        key: `match-${matchIndex}`,
        'data-search-match': isTheCurrentMatch ? 'current' : 'other',
        style: {
          backgroundColor: isSearchActive
            ? isTheCurrentMatch
              ? '#facc15' // yellow-400 - current match
              : '#fef08a' // yellow-200 - other matches
            : 'transparent',
          color: isSearchActive ? '#000' : 'inherit',
          borderRadius: '2px',
          padding: '0 2px',
        },
      },
      content.slice(index, index + searchQuery.length))
    )

    lastIndex = index + searchQuery.length
    matchIndex++
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}

/**
 * Count matches in a string
 */
export function countSearchMatches(content: string, searchQuery: string): number {
  if (!searchQuery.trim()) return 0

  const query = searchQuery.toLowerCase()
  const contentLower = content.toLowerCase()
  let count = 0
  let lastIndex = 0

  while (true) {
    const index = contentLower.indexOf(query, lastIndex)
    if (index === -1) break
    count++
    lastIndex = index + query.length
  }

  return count
}
