export interface PendingPermission {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId?: string
  sessionId: string
  timestamp: number
}
