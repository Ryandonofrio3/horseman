/**
 * Utilities for @pierre/diffs integration
 */
import WorkerUrl from '@pierre/diffs/worker/worker.js?worker&url'

/**
 * Worker factory for @pierre/diffs worker pool
 * Offloads Shiki syntax highlighting to background threads
 */
export function createDiffsWorker(): Worker {
  return new Worker(WorkerUrl, { type: 'module' })
}

/**
 * CSS fallback for browsers that don't support light-dark()
 * Ensures Shiki syntax colors work correctly in older browsers
 */
export const DIFFS_UNSAFE_CSS_FALLBACK = `
@supports not (color: light-dark(white, black)) {
  /* Light theme default */
  [data-diffs] [data-column-content] span {
    color: var(--diffs-token-light, var(--diffs-light)) !important;
  }

  [data-diffs] [data-column-content] span:not([data-diff-span]) {
    background-color: var(--diffs-token-light-bg, inherit) !important;
  }

  /* Dark theme explicit */
  [data-diffs][data-theme-type='dark'] [data-column-content] span {
    color: var(--diffs-token-dark, var(--diffs-dark)) !important;
  }

  [data-diffs][data-theme-type='dark'] [data-column-content] span:not([data-diff-span]) {
    background-color: var(--diffs-token-dark-bg, inherit) !important;
  }

  /* System theme: respect OS preference */
  @media (prefers-color-scheme: dark) {
    [data-diffs]:not([data-theme-type='light']) [data-column-content] span {
      color: var(--diffs-token-dark, var(--diffs-dark)) !important;
    }

    [data-diffs]:not([data-theme-type='light']) [data-column-content] span:not([data-diff-span]) {
      background-color: var(--diffs-token-dark-bg, inherit) !important;
    }
  }
}
`.trim()

/**
 * Convert our theme setting to @pierre/diffs themeType
 */
export function getDiffsThemeType(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' | 'system' {
  return theme
}
