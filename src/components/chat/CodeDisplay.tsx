/**
 * CodeDisplay - Syntax-highlighted code rendering using @pierre/diffs
 *
 * Uses the File component from @pierre/diffs/react for single-file code display
 * with syntax highlighting via Shiki.
 */
import { useMemo } from 'react'
import { File } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'
import { useStore } from '@/store'
import { DIFFS_UNSAFE_CSS_FALLBACK, getDiffsThemeType } from '@/lib/diffs'
import { cn } from '@/lib/utils'

interface CodeDisplayProps {
  code: string
  filename: string // Used for language detection
  className?: string
  cacheKey?: string // For worker pool render caching
}

export function CodeDisplay({ code, filename, className, cacheKey }: CodeDisplayProps) {
  const theme = useStore((state) => state.theme)
  const themeType = getDiffsThemeType(theme)

  const file: FileContents = useMemo(
    () => ({
      name: filename,
      contents: code,
      cacheKey,
    }),
    [filename, code, cacheKey]
  )

  return (
    <div className={cn('rounded-md overflow-hidden', className)}>
      <File
        file={file}
        options={{
          theme: { dark: 'github-dark', light: 'github-light' },
          themeType,
          overflow: 'scroll',
          unsafeCSS: DIFFS_UNSAFE_CSS_FALLBACK,
        }}
      />
    </div>
  )
}
