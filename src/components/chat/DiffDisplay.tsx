/**
 * DiffDisplay - Code diff rendering using @pierre/diffs
 *
 * Uses MultiFileDiff from @pierre/diffs/react to render old/new content
 * with syntax highlighting via Shiki.
 */
import { useMemo } from 'react'
import { MultiFileDiff } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'
import { useStore } from '@/store'
import { DIFFS_UNSAFE_CSS_FALLBACK, getDiffsThemeType } from '@/lib/diffs'
import { cn } from '@/lib/utils'

interface DiffDisplayProps {
  oldContent: string
  newContent: string
  filename: string
  className?: string
  diffStyle?: 'unified' | 'split'
}

export function DiffDisplay({
  oldContent,
  newContent,
  filename,
  className,
  diffStyle = 'unified',
}: DiffDisplayProps) {
  const theme = useStore((state) => state.theme)
  const themeType = getDiffsThemeType(theme)

  const oldFile: FileContents = useMemo(
    () => ({
      name: filename,
      contents: oldContent,
    }),
    [filename, oldContent]
  )

  const newFile: FileContents = useMemo(
    () => ({
      name: filename,
      contents: newContent,
    }),
    [filename, newContent]
  )

  // If both contents are empty, show a message
  if (!oldContent && !newContent) {
    return (
      <div className={cn('p-4 text-muted-foreground text-sm', className)}>
        No content to diff (both old and new are empty)
      </div>
    )
  }

  // If contents are identical, show a message
  if (oldContent === newContent) {
    return (
      <div className={cn('p-4 text-muted-foreground text-sm', className)}>
        No changes (content is identical)
      </div>
    )
  }

  return (
    <div className={cn('rounded-md overflow-hidden', className)}>
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={{
          theme: { dark: 'github-dark', light: 'github-light' },
          themeType,
          diffStyle,
          diffIndicators: 'bars',
          hunkSeparators: 'line-info',
          overflow: 'scroll',
          disableFileHeader: true,
          unsafeCSS: DIFFS_UNSAFE_CSS_FALLBACK,
        }}
      />
    </div>
  )
}
