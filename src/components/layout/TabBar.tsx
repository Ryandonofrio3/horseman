import { memo, useCallback, useMemo } from 'react'
import { useStore } from '@/store'
import { useActiveSessionId, useSessions, needsAttention } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { X, Plus, PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/constants'
import type { Session } from '@/domain'

interface TabItemProps {
  session: Session
  isActive: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

const TabItem = memo(function TabItem({ session, isActive, onSelect, onClose }: TabItemProps) {
  const handleSelect = useCallback(() => {
    onSelect(session.id)
  }, [onSelect, session.id])

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose(session.id)
  }, [onClose, session.id])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(session.id)
    }
  }, [onSelect, session.id])

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer w-32',
        'hover:bg-accent',
        isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
      )}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
    >
      <span
        className={cn(
          'w-2 h-2 rounded-full shrink-0',
          STATUS_COLORS[session.status],
          needsAttention(session.status) && 'animate-pulse'
        )}
      />
      <span className="truncate flex-1">{session.name}</span>
      <button
        className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity shrink-0"
        onClick={handleClose}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
})

interface TabBarProps {
  onNewSession: () => void
}

export function TabBar({ onNewSession }: TabBarProps) {
  const sessions = useSessions()
  const activeSessionId = useActiveSessionId()
  const openTabIds = useStore((state) => state.openTabIds)
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useStore((state) => state.toggleSidebar)
  const setActiveSession = useStore((state) => state.setActiveSession)
  const closeTab = useStore((state) => state.closeTab)

  const openTabs = useMemo(
    () => openTabIds
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is Session => s !== undefined),
    [openTabIds, sessions]
  )

  const handleSelect = useCallback((id: string) => {
    setActiveSession(id)
  }, [setActiveSession])

  const handleClose = useCallback((id: string) => {
    closeTab(id)
  }, [closeTab])

  if (openTabs.length === 0 && !sidebarCollapsed) {
    return null
  }

  return (
    <div className="flex items-center border-b border-border bg-background pt-6 px-2 shrink-0">
      {/* Show sidebar toggle when collapsed */}
      {sidebarCollapsed && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 mr-2 shrink-0"
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Scrollable tabs */}
      <ScrollArea className="flex-1 overflow-hidden [&_[data-slot=scroll-area-scrollbar]]:hidden">
        <div className="flex items-center gap-1 py-1 w-max">
          {openTabs.map((session) => (
            <TabItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={handleSelect}
              onClose={handleClose}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* New tab button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 ml-2 shrink-0"
        onClick={onNewSession}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
