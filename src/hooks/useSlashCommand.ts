import { useCallback } from 'react'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

export interface UseSlashCommandResult {
  isRunning: boolean
  activeCommand: string | null
  output: string
  error: string | null
  detectionMethod: string | null
  runCommand: (claudeSessionId: string, workingDirectory: string, command: string, commandName?: string) => Promise<void>
  cancel: () => Promise<void>
}

export function useSlashCommand(): UseSlashCommandResult {
  const isRunning = useStore((s) => s.slash.isRunning)
  const activeCommand = useStore((s) => s.slash.activeCommand)
  const output = useStore((s) => s.slash.output)
  const error = useStore((s) => s.slash.error)
  const detectionMethod = useStore((s) => s.slash.detectionMethod)
  const activeCommandId = useStore((s) => s.slash.activeCommandId)
  const beginSlashCommand = useStore((s) => s.beginSlashCommand)
  const setSlashCommandId = useStore((s) => s.setSlashCommandId)
  const failSlashCommand = useStore((s) => s.failSlashCommand)
  const endSlashCommand = useStore((s) => s.endSlashCommand)

  const runCommand = useCallback(
    async (claudeSessionId: string, workingDirectory: string, command: string, commandName?: string) => {
      // Set running immediately to avoid race with the 'started' event
      beginSlashCommand(commandName)

      try {
        const result = await ipc.slash.run(claudeSessionId, workingDirectory, command)
        setSlashCommandId(result.command_id)
      } catch (err) {
        failSlashCommand(null, err instanceof Error ? err.message : 'Failed to start command')
      }
    },
    [beginSlashCommand, setSlashCommandId, failSlashCommand]
  )

  const cancel = useCallback(async () => {
    if (activeCommandId) {
      await ipc.slash.cancel(activeCommandId)
      endSlashCommand(activeCommandId)
    }
  }, [activeCommandId, endSlashCommand])

  return {
    isRunning,
    activeCommand,
    output,
    error,
    detectionMethod,
    runCommand,
    cancel,
  }
}
