/**
 * Tool display utilities - icons and colors for different tool types
 */
import {
  FileEdit,
  Terminal,
  Globe,
  Search,
  File,
  Folder,
  Lock,
  Bot,
  ListTodo,
  MessageCircleQuestion,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const TOOL_ICONS: Record<string, LucideIcon> = {
  read: File,
  write: FileEdit,
  edit: FileEdit,
  bash: Terminal,
  glob: Folder,
  grep: Search,
  webfetch: Globe,
  websearch: Search,
  task: Bot,
  todowrite: ListTodo,
  askuserquestion: MessageCircleQuestion,
}

export const TOOL_COLORS: Record<string, string> = {
  read: 'text-blue-500',
  write: 'text-green-500',
  edit: 'text-amber-500',
  bash: 'text-purple-500',
  glob: 'text-cyan-500',
  grep: 'text-cyan-500',
  webfetch: 'text-indigo-500',
  websearch: 'text-indigo-500',
  task: 'text-cyan-500',
  todowrite: 'text-emerald-500',
  askuserquestion: 'text-pink-500',
}

export function getToolIcon(toolName: string): LucideIcon {
  return TOOL_ICONS[toolName.toLowerCase()] ?? Lock
}

export function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName.toLowerCase()] ?? 'text-muted-foreground'
}
