/**
 * DiffsProvider - Worker pool context for @pierre/diffs syntax highlighting
 *
 * Wraps the app to provide worker-based syntax highlighting.
 * Highlighting happens in background threads, keeping main thread responsive.
 */
import type { ReactNode } from 'react'
import { WorkerPoolContextProvider } from '@pierre/diffs/react'
import { createDiffsWorker } from '@/lib/diffs'

interface DiffsProviderProps {
  children: ReactNode
}

export function DiffsProvider({ children }: DiffsProviderProps) {
  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: createDiffsWorker,
        poolSize: 4,
      }}
      highlighterOptions={{
        theme: { dark: 'github-dark', light: 'github-light' },
        langs: ['typescript', 'javascript', 'python', 'rust', 'go', 'json', 'markdown', 'bash', 'css', 'html'],
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  )
}
