import { useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConversationSearchProps {
  isOpen: boolean
  onClose: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  currentMatch: number
  totalMatches: number
  onPrevMatch: () => void
  onNextMatch: () => void
}

export function ConversationSearch({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  currentMatch,
  totalMatches,
  onPrevMatch,
  onNextMatch,
}: ConversationSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opened and select existing text
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isOpen])

  // Handle keyboard shortcuts within the search input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          onPrevMatch()
        } else {
          onNextMatch()
        }
      }
    },
    [onClose, onPrevMatch, onNextMatch]
  )

  if (!isOpen) return null

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-background/95 backdrop-blur-sm p-1.5 shadow-lg">
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search in conversation..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 w-48 text-sm"
      />

      <span
        className={cn(
          'text-xs text-muted-foreground min-w-[4rem] text-center',
          totalMatches === 0 && searchQuery && 'text-destructive'
        )}
      >
        {searchQuery ? `${totalMatches > 0 ? currentMatch : 0}/${totalMatches}` : ''}
      </span>

      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onPrevMatch}
          disabled={totalMatches === 0}
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNextMatch}
          disabled={totalMatches === 0}
          title="Next match (Enter)"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onClose}
        title="Close (Escape)"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
