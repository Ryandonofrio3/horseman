import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { SortOrder } from '@/store/types'
import { Plus, Settings, FolderOpen, Loader2, MessageSquare, ChevronRight, ChevronDown, Folder, PanelLeftClose, Pencil, Trash2, ArrowUpDown, EyeOff, Eye } from 'lucide-react'
import type { DiscoveredSession } from '@/lib/ipc'
import type { Session } from '@/domain'

// Truncate name to max length with ellipsis
const truncateName = (name: string, max = 20) =>
  name.length > max ? name.slice(0, max) + '...' : name

// Memoized session item to prevent re-renders
interface SessionItemProps {
  session: {
    id: string
    name: string
    fullName: string // untruncated name for editing
    date: string
    isDiscovered: boolean
    discoveredSession?: DiscoveredSession
  }
  isActive: boolean
  isEditing: boolean
  editingName: string
  onSelect: (id: string) => void
  onSelectDiscovered: (session: DiscoveredSession) => void
  onStartEdit: (id: string, currentName: string) => void
  onEditingNameChange: (name: string) => void
  onEditingSave: () => void
  onEditingCancel: () => void
  onDelete?: (id: string) => void
}

const SessionItem = memo(function SessionItem({
  session,
  isActive,
  isEditing,
  editingName,
  onSelect,
  onSelectDiscovered,
  onStartEdit,
  onEditingNameChange,
  onEditingSave,
  onEditingCancel,
  onDelete,
}: SessionItemProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleClick = useCallback(() => {
    if (isEditing) return
    if (session.isDiscovered && session.discoveredSession) {
      onSelectDiscovered(session.discoveredSession)
    } else {
      onSelect(session.id)
    }
  }, [session.id, session.isDiscovered, session.discoveredSession, onSelect, onSelectDiscovered, isEditing])

  const handleRename = useCallback(() => {
    onStartEdit(session.id, session.fullName)
  }, [onStartEdit, session.id, session.fullName])

  const handleDelete = useCallback(() => {
    onDelete?.(session.id)
  }, [onDelete, session.id])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEditingSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEditingCancel()
    }
  }, [onEditingSave, onEditingCancel])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'w-full text-left px-3 py-2 rounded-lg transition-colors text-sm',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted'
          )}
        >
          <div className="flex items-center gap-2">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onBlur={onEditingSave}
                onKeyDown={handleKeyDown}
                className="font-medium flex-1 bg-transparent border-b border-primary outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="font-medium truncate flex-1">{session.name}</span>
            )}
            {session.isDiscovered && (
              <Badge className="shrink-0 text-[10px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0">CLI</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground/70">
            {formatDate(session.date)}
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleRename}>
          <Pencil className="h-4 w-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

interface SidebarProps {
  sessions: Session[]
  discoveredSessions: DiscoveredSession[]
  hiddenSessionIds: string[]
  hiddenFolders: string[]
  sortOrder: SortOrder
  activeSessionId: string | null
  isLoading: boolean
  onNewSession: () => void
  onSelectSession: (id: string) => void
  onSelectDiscoveredSession: (session: DiscoveredSession) => void
  onRenameSession?: (id: string, newName: string) => void
  onDeleteSession?: (id: string) => void
  onHideFolder: (path: string) => void
  onUnhideFolder: (path: string) => void
  onSetSortOrder: (order: SortOrder) => void
}

// Group sessions by working directory
interface ProjectGroup {
  path: string
  name: string
  sessions: Array<{
    id: string
    name: string
    fullName: string
    date: string
    isDiscovered: boolean
    discoveredSession?: DiscoveredSession
  }>
}

// Status priority for sorting (lower = higher priority)
const STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  waiting_approval: 1,
  waiting_permission: 1,
  error: 2,
  idle: 3,
}

function groupByProject(
  sessions: Session[],
  discoveredSessions: DiscoveredSession[],
  hiddenSessionIds: string[],
  hiddenFolders: string[],
  sortOrder: SortOrder
): { visible: ProjectGroup[]; hidden: ProjectGroup[] } {
  const groups = new Map<string, ProjectGroup>()
  const sessionStatusMap = new Map<string, string>()

  // Add local sessions
  for (const session of sessions) {
    const path = session.workingDirectory
    if (!groups.has(path)) {
      groups.set(path, {
        path,
        name: path.split('/').pop() || path,
        sessions: [],
      })
    }
    sessionStatusMap.set(session.id, session.status)
    groups.get(path)!.sessions.push({
      id: session.id,
      name: truncateName(session.name),
      fullName: session.name,
      date: session.lastActiveAt,
      isDiscovered: session.isDiscovered || false,
    })
  }

  // Add discovered sessions (skip if already in local sessions or hidden)
  for (const ds of discoveredSessions) {
    // Skip hidden sessions
    if (hiddenSessionIds.includes(ds.id)) continue
    // Skip sessions with local command caveats (these are /clear, etc.)
    if (ds.first_message?.includes('<local-command-caveat>')) continue
    if (ds.first_message?.includes('<command-message>')) continue
    // Check both id and claudeSessionId since Horseman uses nanoid but Claude uses UUID
    const existsInLocal = sessions.find((s) => s.id === ds.id || s.claudeSessionId === ds.id)
    if (existsInLocal) continue

    const path = ds.working_directory
    if (!groups.has(path)) {
      groups.set(path, {
        path,
        name: path.split('/').pop() || path,
        sessions: [],
      })
    }
    const dsName = ds.first_message || ds.id.slice(0, 8)
    sessionStatusMap.set(ds.id, 'idle') // Discovered sessions default to idle
    groups.get(path)!.sessions.push({
      id: ds.id,
      name: truncateName(dsName),
      fullName: dsName,
      date: ds.modified_at,
      isDiscovered: true,
      discoveredSession: ds,
    })
  }

  // Convert to array
  const allGroups = Array.from(groups.values())

  // Separate visible and hidden folders
  const hiddenSet = new Set(hiddenFolders)
  const visible = allGroups.filter((g) => !hiddenSet.has(g.path))
  const hidden = allGroups.filter((g) => hiddenSet.has(g.path))

  // Sort function based on sortOrder
  const sortGroups = (groupList: ProjectGroup[]) => {
    if (sortOrder === 'name') {
      groupList.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortOrder === 'status') {
      // Sort by best (lowest priority number) status in group
      groupList.sort((a, b) => {
        const aMinPriority = Math.min(...a.sessions.map((s) => STATUS_PRIORITY[sessionStatusMap.get(s.id) || 'idle'] ?? 3))
        const bMinPriority = Math.min(...b.sessions.map((s) => STATUS_PRIORITY[sessionStatusMap.get(s.id) || 'idle'] ?? 3))
        if (aMinPriority !== bMinPriority) return aMinPriority - bMinPriority
        // Tie-breaker: most recent
        const aLatest = a.sessions.reduce((max, s) => (s.date > max ? s.date : max), '')
        const bLatest = b.sessions.reduce((max, s) => (s.date > max ? s.date : max), '')
        return bLatest.localeCompare(aLatest)
      })
    } else {
      // 'recent' - default
      groupList.sort((a, b) => {
        const aLatest = a.sessions.reduce((max, s) => (s.date > max ? s.date : max), '')
        const bLatest = b.sessions.reduce((max, s) => (s.date > max ? s.date : max), '')
        return bLatest.localeCompare(aLatest)
      })
    }
  }

  sortGroups(visible)
  sortGroups(hidden)

  // Sort sessions within each group
  const sortSessions = (groupList: ProjectGroup[]) => {
    for (const group of groupList) {
      if (sortOrder === 'name') {
        group.sessions.sort((a, b) => a.fullName.localeCompare(b.fullName))
      } else if (sortOrder === 'status') {
        group.sessions.sort((a, b) => {
          const aPriority = STATUS_PRIORITY[sessionStatusMap.get(a.id) || 'idle'] ?? 3
          const bPriority = STATUS_PRIORITY[sessionStatusMap.get(b.id) || 'idle'] ?? 3
          if (aPriority !== bPriority) return aPriority - bPriority
          return b.date.localeCompare(a.date)
        })
      } else {
        group.sessions.sort((a, b) => b.date.localeCompare(a.date))
      }
    }
  }

  sortSessions(visible)
  sortSessions(hidden)

  return { visible, hidden }
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: 'Recent',
  name: 'Name',
  status: 'Status',
}

export function Sidebar({
  sessions,
  discoveredSessions,
  hiddenSessionIds,
  hiddenFolders,
  sortOrder,
  activeSessionId,
  isLoading,
  onNewSession,
  onSelectSession,
  onSelectDiscoveredSession,
  onRenameSession,
  onDeleteSession,
  onHideFolder,
  onUnhideFolder,
  onSetSortOrder,
}: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showHiddenFolders, setShowHiddenFolders] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const prevSessionIdsRef = useRef<Set<string>>(new Set())
  const lastAutoExpandedSessionRef = useRef<string | null>(null)

  // Auto-unhide folders when new sessions are created in them
  useEffect(() => {
    const currentIds = new Set(sessions.map(s => s.id))
    const prevIds = prevSessionIdsRef.current

    for (const session of sessions) {
      if (!prevIds.has(session.id) && hiddenFolders.includes(session.workingDirectory)) {
        onUnhideFolder(session.workingDirectory)
      }
    }

    prevSessionIdsRef.current = currentIds
  }, [sessions, hiddenFolders, onUnhideFolder])

  const { visible: projectGroups, hidden: hiddenGroups } = useMemo(
    () => groupByProject(sessions, discoveredSessions, hiddenSessionIds, hiddenFolders, sortOrder),
    [sessions, discoveredSessions, hiddenSessionIds, hiddenFolders, sortOrder]
  )

  // Editing handlers
  const handleStartEdit = useCallback((id: string, currentName: string) => {
    setEditingSessionId(id)
    setEditingName(currentName)
  }, [])

  const handleEditingSave = useCallback(() => {
    if (editingSessionId && editingName.trim()) {
      onRenameSession?.(editingSessionId, editingName.trim())
    }
    setEditingSessionId(null)
    setEditingName('')
  }, [editingSessionId, editingName, onRenameSession])

  const handleEditingCancel = useCallback(() => {
    setEditingSessionId(null)
    setEditingName('')
  }, [])

  // Auto-expand group containing active session (only when activeSessionId changes)
  useEffect(() => {
    if (activeSessionId && activeSessionId !== lastAutoExpandedSessionRef.current) {
      for (const group of projectGroups) {
        if (group.sessions.some((s) => s.id === activeSessionId)) {
          setExpandedGroups((prev) => {
            if (prev.has(group.path)) return prev
            return new Set([...prev, group.path])
          })
          lastAutoExpandedSessionRef.current = activeSessionId
          break
        }
      }
    }
  }, [activeSessionId, projectGroups])

  const toggleGroup = useCallback((path: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const toggleSidebar = useStore((state) => state.toggleSidebar)

  return (
    <div className="flex h-full flex-col bg-background overflow-hidden">
      {/* Header with drag region for window */}
      <div className="flex items-center justify-between p-3 pt-8 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Horseman</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onNewSession}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleSidebar}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sort dropdown */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowUpDown className="h-3 w-3" />
              {SORT_LABELS[sortOrder]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onSetSortOrder('recent')}>
              Recent {sortOrder === 'recent' && '✓'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetSortOrder('name')}>
              Name {sortOrder === 'name' && '✓'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetSortOrder('status')}>
              Status {sortOrder === 'status' && '✓'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Session List - min-h-0 needed for flex scroll containment */}
      <ScrollArea className="flex-1 min-h-0 [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:scrollbar-none">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projectGroups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm px-4">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No sessions yet</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onNewSession}>
              New Session
            </Button>
          </div>
        ) : (
          <div className="py-2">
            {projectGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.path)
              const hasActiveSession = group.sessions.some((s) => s.id === activeSessionId)

              return (
                <div key={group.path} className="mb-1">
                  {/* Project header with context menu */}
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <button
                        onClick={() => toggleGroup(group.path)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors',
                          hasActiveSession && 'text-primary'
                        )}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{group.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {group.sessions.length}
                        </span>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => onHideFolder(group.path)}>
                        <EyeOff className="h-4 w-4" />
                        Hide folder
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

                  {/* Sessions in this project */}
                  {isExpanded && (
                    <div className="ml-4 pl-2 border-l border-border/50">
                      {group.sessions.map((session) => (
                        <SessionItem
                          key={session.id}
                          session={session}
                          isActive={session.id === activeSessionId}
                          isEditing={session.id === editingSessionId}
                          editingName={session.id === editingSessionId ? editingName : ''}
                          onSelect={onSelectSession}
                          onSelectDiscovered={onSelectDiscoveredSession}
                          onStartEdit={handleStartEdit}
                          onEditingNameChange={setEditingName}
                          onEditingSave={handleEditingSave}
                          onEditingCancel={handleEditingCancel}
                          onDelete={onDeleteSession}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Hidden folders section */}
            {hiddenGroups.length > 0 && (
              <div className="mt-4 border-t border-border/50 pt-2">
                <button
                  onClick={() => setShowHiddenFolders(!showHiddenFolders)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showHiddenFolders ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <EyeOff className="h-3 w-3 shrink-0" />
                  <span>{hiddenGroups.length} folder{hiddenGroups.length !== 1 ? 's' : ''} hidden</span>
                </button>

                {showHiddenFolders && (
                  <div className="mt-1">
                    {hiddenGroups.map((group) => (
                      <div
                        key={group.path}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground"
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="truncate flex-1 opacity-75">{group.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={() => onUnhideFolder(group.path)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border p-2 shrink-0">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
  } catch {
    return dateStr
  }
}
