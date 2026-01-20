import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Keyboard, Terminal } from 'lucide-react'

interface HelpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SHORTCUTS = [
  { keys: ['⌘', 'N'], description: 'New session (same directory)' },
  { keys: ['⌘', 'T'], description: 'New tab (same directory)' },
  { keys: ['⌘', 'W'], description: 'Close tab' },
  { keys: ['⌘', '1-9'], description: 'Switch to tab' },
  { keys: ['⌘', '['], description: 'Previous tab' },
  { keys: ['⌘', ']'], description: 'Next tab' },
  { keys: ['⌘', 'K'], description: 'Clear input' },
  { keys: ['⌘', 'F'], description: 'Search conversation' },
  { keys: ['↑', '↓'], description: 'Input history' },
  { keys: ['Esc'], description: 'Stop generation' },
  { keys: ['Shift', 'Tab'], description: 'Cycle permission mode' },
]

const SLASH_COMMANDS = [
  { command: '/clear', description: 'Clear conversation history' },
  { command: '/compact', description: 'Compress context' },
  { command: '/help', description: 'Show this help' },
  { command: '/export', description: 'Copy conversation to clipboard' },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted border border-border rounded">
      {children}
    </kbd>
  )
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Horseman
          </DialogTitle>
          <DialogDescription>
            A native macOS GUI for Claude Code. Under the hood, it runs the real{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">claude</code> CLI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Keyboard shortcuts */}
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
              <Keyboard className="h-4 w-4" />
              Keyboard Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {SHORTCUTS.map(({ keys, description }) => (
                <div key={description} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground truncate">{description}</span>
                  <span className="flex items-center gap-0.5 shrink-0">
                    {keys.map((key, i) => (
                      <Kbd key={i}>{key}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Slash commands */}
          <div>
            <h3 className="text-sm font-medium mb-2">Slash Commands</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {SLASH_COMMANDS.map(({ command, description }) => (
                <div key={command} className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {command}
                  </code>
                  <span className="text-muted-foreground truncate">{description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <p>
              Type <code className="bg-muted px-1 rounded">@</code> to reference files,{' '}
              <code className="bg-muted px-1 rounded">/</code> for commands.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
