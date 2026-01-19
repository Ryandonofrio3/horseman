import { memo } from 'react'
import {
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'
import { ContextUsage } from './ContextUsage'
import { ModelBadge } from './ModelBadge'
import { ModeBadge } from './ModeBadge'
import { Folder, Square } from 'lucide-react'
import type { SessionUsage } from '@/domain'

interface ChatInputFooterProps {
  workingDirectory: string
  isWorking: boolean
  usage?: SessionUsage
  onStop: () => void
}

export const ChatInputFooter = memo(function ChatInputFooter({
  workingDirectory,
  isWorking,
  usage,
  onStop,
}: ChatInputFooterProps) {
  const folderName = workingDirectory?.split('/').pop() || 'No folder'

  return (
    <PromptInputFooter>
      <PromptInputTools>
        <PromptInputButton disabled title={workingDirectory}>
          <Folder className="h-4 w-4" />
          <span className="text-xs truncate max-w-32">{folderName}</span>
        </PromptInputButton>
        <ModelBadge />
        <ModeBadge />
        {usage && <ContextUsage usage={usage} />}
      </PromptInputTools>
      <div className="flex items-center gap-2">
        {isWorking && (
          <PromptInputButton onClick={onStop} variant="destructive" size="sm">
            <Square className="h-3 w-3" />
            Stop
          </PromptInputButton>
        )}
        <PromptInputSubmit />
      </div>
    </PromptInputFooter>
  )
})
