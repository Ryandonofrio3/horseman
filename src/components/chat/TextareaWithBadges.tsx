/**
 * TextareaWithBadges - Textarea with inline @path badge rendering
 *
 * Uses an overlay approach: the actual textarea has transparent text,
 * and a mirrored overlay div renders the same text with @paths styled as badges.
 * This gives the appearance of rich text in a regular textarea.
 */
import { forwardRef, useMemo, useRef, useEffect, useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { AtSign, Folder } from 'lucide-react'

interface TextareaWithBadgesProps extends Omit<ComponentProps<'textarea'>, 'className'> {
  value: string
  className?: string
  /** Paths that are confirmed (have pills) - shown with colored badges */
  confirmedPaths?: Set<string>
}

interface TextSegment {
  type: 'text' | 'path'
  content: string
  isDirectory?: boolean
}

// Parse text into segments of plain text and @paths
function parseTextSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  // Match @path patterns (path can contain word chars, dots, slashes, hyphens)
  const pattern = /@([\w./-]+)/g
  let lastIndex = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    // Add the @path
    const path = match[1]
    segments.push({
      type: 'path',
      content: path,
      isDirectory: path.endsWith('/'),
    })
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return segments
}

export const TextareaWithBadges = forwardRef<HTMLTextAreaElement, TextareaWithBadgesProps>(
  ({ value, className, confirmedPaths, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const internalRef = useRef<HTMLTextAreaElement>(null)
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef

    // Sync scroll between textarea and overlay
    const [scrollTop, setScrollTop] = useState(0)

    useEffect(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      const handleScroll = () => {
        setScrollTop(textarea.scrollTop)
      }

      textarea.addEventListener('scroll', handleScroll)
      return () => textarea.removeEventListener('scroll', handleScroll)
    }, [textareaRef])

    // Parse text into segments
    const segments = useMemo(() => parseTextSegments(value || ''), [value])

    // Check if a path is confirmed (has a pill)
    const isConfirmed = (path: string) => {
      if (!confirmedPaths) return false
      const normalized = path.replace(/\/$/, '')
      return confirmedPaths.has(normalized)
    }

    return (
      <div ref={containerRef} className="relative w-full">
        {/* Overlay - renders styled text */}
        <div
          ref={overlayRef}
          className={cn(
            // Match textarea styling exactly
            'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words',
            // Match InputGroupTextarea styles
            'border-none bg-transparent px-4 py-3 text-sm',
            'field-sizing-content max-h-48 min-h-16',
          )}
          style={{
            scrollPaddingTop: scrollTop,
            // Use negative margin to offset scroll
            marginTop: -scrollTop,
          }}
          aria-hidden="true"
        >
          {segments.map((segment, i) => {
            if (segment.type === 'text') {
              // Render plain text
              return <span key={i}>{segment.content}</span>
            }

            // Render @path as badge
            const confirmed = isConfirmed(segment.content)
            const Icon = segment.isDirectory ? Folder : AtSign

            return (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium align-baseline mx-0.5',
                  confirmed
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-muted text-muted-foreground border border-border',
                )}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[200px]">{segment.content}</span>
              </span>
            )
          })}
        </div>

        {/* Actual textarea - invisible text, visible caret */}
        <textarea
          ref={textareaRef}
          value={value}
          className={cn(
            // Same styling as overlay
            'w-full resize-none border-none bg-transparent px-4 py-3 text-sm',
            'field-sizing-content max-h-48 min-h-16',
            'focus:outline-none focus:ring-0',
            // Make text transparent but keep caret visible
            'caret-foreground',
            className,
          )}
          style={{
            color: 'transparent',
            // WebKit caret color
            caretColor: 'var(--foreground)',
          }}
          {...props}
        />
      </div>
    )
  }
)

TextareaWithBadges.displayName = 'TextareaWithBadges'
