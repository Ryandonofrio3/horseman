import { useStore } from '@/store'
import type { PermissionMode } from '@/store/types'

const MODE_ORDER: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'bypassPermissions']

const MODE_DISPLAY: Record<PermissionMode, string> = {
  default: 'Normal',
  plan: 'Plan',
  acceptEdits: 'Auto-Accept',
  bypassPermissions: 'Bypass All',
}

const MODE_COLORS: Record<PermissionMode, string> = {
  default: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
  plan: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  acceptEdits: 'bg-green-500/15 text-green-600 dark:text-green-400',
  bypassPermissions: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

export function ModeBadge() {
  const mode = useStore((s) => s.permissionMode)
  const cycleMode = useStore((s) => s.cyclePermissionMode)

  return (
    <button
      type="button"
      onClick={cycleMode}
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all hover:opacity-80 active:scale-95 ${MODE_COLORS[mode]}`}
      title="Click to switch permission mode (Shift+Tab)"
    >
      {MODE_DISPLAY[mode]}
    </button>
  )
}
