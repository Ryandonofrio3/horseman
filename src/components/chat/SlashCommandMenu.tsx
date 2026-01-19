import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Minimize2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SlashCommand {
  id: string
  name: string
  description: string
  icon: React.ReactNode
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'clear',
    name: '/clear',
    description: 'Clear conversation history',
    icon: <Trash2 className="h-4 w-4" />,
  },
  {
    id: 'compact',
    name: '/compact',
    description: 'Compress conversation context',
    icon: <Minimize2 className="h-4 w-4" />,
  },
  {
    id: 'init',
    name: '/init',
    description: 'Initialize project with CLAUDE.md',
    icon: <FileText className="h-4 w-4" />,
  },
]

interface SlashCommandMenuProps {
  query: string
  position: { top: number; left: number } | null
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  onClose: () => void
  onCommandsChange: (count: number) => void
}

export function SlashCommandMenu({
  query,
  position,
  selectedIndex,
  onSelect,
  onClose,
  onCommandsChange,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Filter commands by query
  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  )

  // Update parent with command count
  useEffect(() => {
    onCommandsChange(filteredCommands.length)
  }, [filteredCommands.length, onCommandsChange])

  // Expose selected command for keyboard selection
  useEffect(() => {
    const selected = filteredCommands[selectedIndex]
    if (selected) {
      ;(window as unknown as Record<string, SlashCommand>).__slashCommandSelected = selected
    }
  }, [selectedIndex, filteredCommands])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-slash-menu]')) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (!position) return null

  const dropdown = (
    <div
      ref={menuRef}
      data-slash-menu
      className={cn(
        'fixed z-50 w-72 overflow-hidden',
        'rounded-lg border border-border bg-popover shadow-lg'
      )}
      style={{
        top: position.top - 8,
        left: position.left,
        transform: 'translateY(-100%)',
      }}
    >
      {filteredCommands.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          No commands found
        </div>
      ) : (
        <div className="p-1">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Commands
          </div>
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.id}
              onClick={() => onSelect(cmd)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <span className="text-muted-foreground">{cmd.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{cmd.name}</div>
                <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return createPortal(dropdown, document.body)
}

export { SLASH_COMMANDS }
