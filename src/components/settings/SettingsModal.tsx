import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ipc, type HorsemanConfig } from '@/lib/ipc'
import { Loader2, RotateCcw, FolderOpen } from 'lucide-react'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_CONFIG: HorsemanConfig = {
  claudeBinary: null,
  projectsDir: null,
  debugLogPath: null,
  contextWindow: null,
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [config, setConfig] = useState<HorsemanConfig>(DEFAULT_CONFIG)
  const [configPath, setConfigPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load config when modal opens
  useEffect(() => {
    if (open) {
      setIsLoading(true)
      setError(null)
      Promise.all([ipc.config.get(), ipc.config.getPath()])
        .then(([cfg, path]) => {
          setConfig(cfg)
          setConfigPath(path)
        })
        .catch((e) => setError(String(e)))
        .finally(() => setIsLoading(false))
    }
  }, [open])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      await ipc.config.update(config)
      onOpenChange(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setIsSaving(false)
    }
  }, [config, onOpenChange])

  const handleReset = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
  }, [])

  const updateField = useCallback(
    <K extends keyof HorsemanConfig>(field: K, value: HorsemanConfig[K]) => {
      setConfig((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  // Convert empty strings to null for config values
  const normalizeValue = (val: string): string | null => {
    const trimmed = val.trim()
    return trimmed === '' ? null : trimmed
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure Horseman paths and behavior. Leave blank for defaults.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Paths Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Paths</h3>

              <div className="space-y-2">
                <Label htmlFor="claudeBinary">Claude CLI Binary</Label>
                <Input
                  id="claudeBinary"
                  value={config.claudeBinary ?? ''}
                  onChange={(e) => updateField('claudeBinary', normalizeValue(e.target.value))}
                  placeholder="claude"
                />
                <p className="text-xs text-muted-foreground">
                  Path to Claude CLI executable. Default: <code>claude</code> (found in PATH)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectsDir">Projects Directory</Label>
                <div className="flex gap-2">
                  <Input
                    id="projectsDir"
                    value={config.projectsDir ?? ''}
                    onChange={(e) => updateField('projectsDir', normalizeValue(e.target.value))}
                    placeholder="~/.claude/projects"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      // TODO: Implement folder picker
                    }}
                    title="Browse..."
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Where Claude stores transcripts. Default: <code>~/.claude/projects</code>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="debugLogPath">Debug Log Path</Label>
                <Input
                  id="debugLogPath"
                  value={config.debugLogPath ?? ''}
                  onChange={(e) => updateField('debugLogPath', normalizeValue(e.target.value))}
                  placeholder="./horseman-debug.log"
                />
                <p className="text-xs text-muted-foreground">
                  Log file location. Set <code>HORSEMAN_DEBUG_LOG=none</code> env var to disable.
                </p>
              </div>
            </div>

            <Separator />

            {/* Advanced Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Advanced</h3>

              <div className="space-y-2">
                <Label htmlFor="contextWindow">Context Window (tokens)</Label>
                <Input
                  id="contextWindow"
                  type="number"
                  value={config.contextWindow ?? ''}
                  onChange={(e) => {
                    const val = e.target.value.trim()
                    updateField('contextWindow', val === '' ? null : parseInt(val, 10) || null)
                  }}
                  placeholder="200000"
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Fallback context window size when not reported by model. Default: 200,000
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {configPath && (
              <p className="text-xs text-muted-foreground">
                Config file: <code className="text-xs">{configPath}</code>
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isLoading || isSaving}
            className="text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading || isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
