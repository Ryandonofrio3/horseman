import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Info, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { ipc, type StatusInfo } from '@/lib/ipc'

interface StatusModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId?: string
  claudeSessionId?: string
  workingDirectory: string
  model: string
}

const MODEL_LABELS: Record<string, string> = {
  opus: 'Opus 4.5 · Most capable',
  sonnet: 'Sonnet 4 · Balanced',
  haiku: 'Haiku 3.5 · Fastest',
}

const SUBSCRIPTION_LABELS: Record<string, string> = {
  max: 'Claude Max Account',
  pro: 'Claude Pro Account',
  api: 'API Key',
  free: 'Free Account',
}

export function StatusModal({
  open,
  onOpenChange,
  sessionId,
  claudeSessionId,
  workingDirectory,
  model,
}: StatusModalProps) {
  const [status, setStatus] = useState<StatusInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setError(null)

    ipc.status
      .get(workingDirectory)
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch status'))
      .finally(() => setLoading(false))
  }, [open, workingDirectory])

  const folderName = workingDirectory?.split('/').pop() || workingDirectory

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Status
          </DialogTitle>
          <DialogDescription>
            Session and account information
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-4 text-center text-sm text-destructive">{error}</div>
        ) : status ? (
          <div className="space-y-4 mt-2">
            {/* Version & Account */}
            <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono">{status.version ?? 'Unknown'}</span>

              <span className="text-muted-foreground">Account</span>
              <span>
                {status.subscription_type
                  ? SUBSCRIPTION_LABELS[status.subscription_type] ?? status.subscription_type
                  : 'Unknown'}
              </span>

              <span className="text-muted-foreground">Model</span>
              <span>{MODEL_LABELS[model] ?? model}</span>

              <span className="text-muted-foreground">cwd</span>
              <span className="font-mono text-xs truncate" title={workingDirectory}>
                {folderName}
              </span>

              {claudeSessionId && (
                <>
                  <span className="text-muted-foreground">Session</span>
                  <span className="font-mono text-xs truncate" title={claudeSessionId}>
                    {claudeSessionId.slice(0, 8)}...
                  </span>
                </>
              )}
            </div>

            {/* MCP Servers */}
            {status.mcp_servers.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">MCP Servers</h3>
                <div className="space-y-1">
                  {status.mcp_servers.map((server) => (
                    <div
                      key={server.name}
                      className="flex items-center gap-2 text-sm"
                    >
                      {server.connected ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="font-mono text-xs">{server.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Memory Files */}
            {status.memory_files.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Memory</h3>
                <div className="space-y-1">
                  {status.memory_files.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="text-xs text-muted-foreground w-12">
                        {file.scope}
                      </span>
                      <span className="font-mono text-xs truncate">
                        {file.scope === 'user'
                          ? file.path.replace(/^.*\.claude\//, '~/.claude/')
                          : file.path.split('/').pop()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="text-xs text-muted-foreground border-t pt-3">
              <p>
                Press <kbd className="bg-muted px-1 rounded">Esc</kbd> to close
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
