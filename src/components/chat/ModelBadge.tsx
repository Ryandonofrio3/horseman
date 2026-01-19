import { memo } from 'react'
import { useStore } from '@/store'
import type { ModelAlias } from '@/store/types'

const MODEL_DISPLAY: Record<ModelAlias, string> = {
  sonnet: 'Sonnet 4.5',
  opus: 'Opus 4.5',
  haiku: 'Haiku 4.5',
}

const MODEL_COLORS: Record<ModelAlias, string> = {
  sonnet: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  opus: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  haiku: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
}

export const ModelBadge = memo(function ModelBadge() {
  const model = useStore((s) => s.model)
  const cycleModel = useStore((s) => s.cycleModel)

  return (
    <button
      type="button"
      onClick={cycleModel}
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all hover:opacity-80 active:scale-95 ${MODEL_COLORS[model]}`}
      title="Click to switch model"
    >
      {MODEL_DISPLAY[model]}
    </button>
  )
})
