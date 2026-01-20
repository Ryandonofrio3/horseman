import { invoke } from '@tauri-apps/api/core'
import type { Message, Question, SessionUsage, TodoItem, ToolCall } from '@/domain'

export interface SpawnSessionArgs {
  ui_session_id: string
  working_directory: string
  initial_prompt?: string
  resume_session?: string
  model?: 'sonnet' | 'opus' | 'haiku'
}

export interface SpawnSessionResult {
  session_id: string
}

export interface DiscoveredSession {
  id: string
  working_directory: string
  transcript_path: string
  modified_at: string
  first_message: string | null
}

export interface FileEntry {
  path: string
  is_dir: boolean
}

export interface HorsemanConfig {
  claudeBinary: string | null
  projectsDir: string | null
  debugLogPath: string | null
  contextWindow: number | null
}

export interface StatusInfo {
  version: string | null
  subscription_type: string | null
  mcp_servers: McpServer[]
  memory_files: MemoryFile[]
}

export interface McpServer {
  name: string
  connected: boolean
}

export interface MemoryFile {
  path: string
  scope: string
}

export type TranscriptMessage = Omit<Message, 'timestamp'> & { timestamp: string }

export interface PendingQuestionFromTranscript {
  toolUseId: string
  questions: Question[]
}

export interface TranscriptSummary {
  summary: string
}

export interface TranscriptParseResult {
  messages: TranscriptMessage[]
  todos: TodoItem[] | null
  usage: SessionUsage | null
  totalCostUsd: number | null
  pendingQuestion: PendingQuestionFromTranscript | null
  summaries: TranscriptSummary[]
  /** Tools from subagent transcripts, with parentToolId set to their Task tool */
  subagentTools: ToolCall[]
}

export const ipc = {
  claude: {
    spawn: (args: SpawnSessionArgs) =>
      invoke<SpawnSessionResult>('spawn_claude_session', { args }),
    sendMessage: (
      uiSessionId: string,
      claudeSessionId: string,
      workingDirectory: string,
      content: string,
      model?: string
    ) =>
      invoke<SpawnSessionResult>('send_claude_message', {
        uiSessionId,
        claudeSessionId,
        workingDirectory,
        content,
        model,
      }),
    interrupt: (uiSessionId: string) =>
      invoke<void>('interrupt_claude_session', { uiSessionId }),
    isRunning: (uiSessionId: string) =>
      invoke<boolean>('is_claude_running', { uiSessionId }),
    remove: (uiSessionId: string) =>
      invoke<void>('remove_claude_session', { uiSessionId }),
  },
  sessions: {
    listAll: () =>
      invoke<DiscoveredSession[]>('list_claude_sessions'),
    listForDirectory: (workingDirectory: string) =>
      invoke<DiscoveredSession[]>('list_sessions_for_directory', { workingDirectory }),
    readTranscript: (transcriptPath: string) =>
      invoke<string>('read_session_transcript', { transcriptPath }),
    parseTranscript: (transcriptPath: string) =>
      invoke<TranscriptParseResult>('parse_session_transcript', { transcriptPath }),
    extractSummary: (transcriptPath: string) =>
      invoke<string | null>('extract_transcript_summary', { transcriptPath }),
    getTranscriptPath: (workingDirectory: string, sessionId: string) =>
      invoke<string>('get_transcript_path', { workingDirectory, sessionId }),
  },
  permissions: {
    respond: (
      requestId: string,
      allow: boolean,
      options?: {
        message?: string
        toolName?: string
        allowForSession?: boolean
        answers?: Record<string, string>
      }
    ) =>
      invoke<void>('respond_permission', {
        requestId,
        allow,
        message: options?.message,
        toolName: options?.toolName,
        allowForSession: options?.allowForSession,
        answers: options?.answers,
      }),
    getHookServerPort: () =>
      invoke<number>('get_hook_server_port'),
  },
  questions: {
    respond: (requestId: string, answers: Record<string, string>) =>
      invoke<void>('respond_permission', {
        requestId,
        allow: true,
        answers,
      }),
  },
  files: {
    glob: (workingDirectory: string, query: string, maxResults?: number) =>
      invoke<FileEntry[]>('glob_files', { workingDirectory, query, maxResults }),
  },
  greet: (name: string) =>
    invoke<string>('greet', { name }),
  slash: {
    run: (claudeSessionId: string, workingDirectory: string, slashCommand: string) =>
      invoke<{ command_id: string }>('run_slash_command', {
        args: { claude_session_id: claudeSessionId, working_directory: workingDirectory, slash_command: slashCommand },
      }),
    cancel: (commandId: string) =>
      invoke<void>('cancel_slash_command', { commandId }),
  },
  config: {
    get: () =>
      invoke<HorsemanConfig>('get_horseman_config'),
    update: (config: HorsemanConfig) =>
      invoke<HorsemanConfig>('update_horseman_config', { config }),
    getPath: () =>
      invoke<string | null>('get_config_path'),
  },
  status: {
    get: (workingDirectory: string) =>
      invoke<StatusInfo>('get_status_info', { workingDirectory }),
  },
}
