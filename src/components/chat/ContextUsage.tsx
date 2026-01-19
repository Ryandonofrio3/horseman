import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import type { SessionUsage } from '@/domain'

interface ContextUsageProps {
  usage: SessionUsage
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`
  }
  return String(n)
}

export function ContextUsage({ usage }: ContextUsageProps) {
  const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, contextWindow } = usage

  // Total tokens used (input + output, cache read doesn't count against context)
  const totalUsed = inputTokens + outputTokens + cacheCreationTokens
  const usedPercent = Math.min(totalUsed / contextWindow, 1)
  const displayPercent = (usedPercent * 100).toFixed(1)

  // Circle params
  const radius = 8
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - usedPercent)

  // Color based on usage
  const getColor = () => {
    if (usedPercent > 0.9) return 'text-red-500'
    if (usedPercent > 0.7) return 'text-yellow-500'
    return 'text-muted-foreground'
  }

  return (
    <HoverCard openDelay={100} closeDelay={50}>
      <HoverCardTrigger asChild>
        <button className={`flex items-center gap-1.5 text-xs ${getColor()} hover:opacity-80 transition-opacity`}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            className="transform -rotate-90"
          >
            {/* Background circle */}
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.2"
            />
            {/* Progress circle */}
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
          <span className="font-mono">{displayPercent}%</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-48 p-3 text-xs">
        <div className="space-y-2">
          <div className="font-medium mb-2">Context Usage</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Input</span>
            <span className="font-mono">{formatTokens(inputTokens)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Output</span>
            <span className="font-mono">{formatTokens(outputTokens)}</span>
          </div>
          {cacheReadTokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache read</span>
              <span className="font-mono">{formatTokens(cacheReadTokens)}</span>
            </div>
          )}
          {cacheCreationTokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache write</span>
              <span className="font-mono">{formatTokens(cacheCreationTokens)}</span>
            </div>
          )}
          <div className="border-t pt-2 mt-2 flex justify-between font-medium">
            <span>Total</span>
            <span className="font-mono">{formatTokens(totalUsed)} / {formatTokens(contextWindow)}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
