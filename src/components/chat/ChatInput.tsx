import { useState, useCallback, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import type { FileEntry } from '@/lib/ipc'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  PromptInputButton,
  PromptInputProvider,
  usePromptInputController,
} from '@/components/ai-elements/prompt-input'
import { ContextUsage } from './ContextUsage'
import { ModelBadge } from './ModelBadge'
import { ModeBadge } from './ModeBadge'
import { FileAutocomplete } from './FileAutocomplete'
import { SlashCommandMenu, type SlashCommand } from './SlashCommandMenu'
import { Folder, Square } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { SessionUsage } from '@/domain'
import type { FileBlock, PendingFile } from '@/domain'

// Thresholds for converting paste to file pill
const PASTE_LINE_THRESHOLD = 50
const PASTE_CHAR_THRESHOLD = 5000

// Detect language from content heuristics
function detectLanguage(content: string): string | undefined {
  const firstLine = content.split('\n')[0].trim()

  // Common patterns
  if (firstLine.startsWith('import ') || firstLine.startsWith('export ')) return 'ts'
  if (firstLine.startsWith('package ')) return 'go'
  if (firstLine.startsWith('use ') || firstLine.startsWith('fn ')) return 'rs'
  if (firstLine.startsWith('def ') || firstLine.startsWith('class ') || firstLine.startsWith('import ')) return 'py'
  if (firstLine.startsWith('<?php')) return 'php'
  if (firstLine.startsWith('<!DOCTYPE') || firstLine.startsWith('<html')) return 'html'
  if (firstLine.startsWith('{') || firstLine.startsWith('[')) return 'json'
  if (content.includes('function ') || content.includes('const ') || content.includes('let ')) return 'js'

  return undefined
}

interface ChatInputProps {
  workingDirectory: string
  isWorking: boolean
  usage?: SessionUsage
  pendingFiles: PendingFile[]
  setPendingFiles: React.Dispatch<React.SetStateAction<PendingFile[]>>
  onSendMessage: (text: string, fileBlocks?: FileBlock[]) => Promise<void>
  onStop: () => Promise<void>
  onSlashCommand?: (command: SlashCommand) => void
}

// Unified menu state for @ autocomplete and / slash commands
interface MenuState {
  type: '@' | '/' | null
  query: string
  triggerIndex: number
  selectedIndex: number
  position: { top: number; left: number } | null
}

const initialMenuState: MenuState = {
  type: null,
  query: '',
  triggerIndex: -1,
  selectedIndex: 0,
  position: null,
}

// Inner component that uses the provider context
function ChatInputInner({
  workingDirectory,
  isWorking,
  usage,
  pendingFiles,
  setPendingFiles,
  onSendMessage,
  onStop,
  onSlashCommand,
}: ChatInputProps) {
  const controller = usePromptInputController()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Unified menu state for @ and / triggers
  const [menu, setMenu] = useState<MenuState>(initialMenuState)
  const [fileCount, setFileCount] = useState(0)
  const [slashCommandCount, setSlashCommandCount] = useState(0)

  // Refs for selected items (replaces window mutation anti-pattern)
  const selectedFileRef = useRef<FileEntry | null>(null)
  const selectedSlashCommandRef = useRef<SlashCommand | null>(null)

  // Menu helpers
  const closeMenu = useCallback(() => {
    setMenu(initialMenuState)
  }, [])

  const openMenu = useCallback((
    type: '@' | '/',
    query: string,
    triggerIndex: number,
    position: { top: number; left: number }
  ) => {
    setMenu({ type, query, triggerIndex, selectedIndex: 0, position })
  }, [])

  const updateMenuQuery = useCallback((query: string) => {
    setMenu(prev => ({ ...prev, query }))
  }, [])

  const updateMenuSelection = useCallback((selectedIndex: number) => {
    setMenu(prev => ({ ...prev, selectedIndex }))
  }, [])

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData?.getData('text/plain')
    if (!text || !setPendingFiles) return

    const lineCount = text.split('\n').length
    const charCount = text.length

    // Check thresholds
    if (lineCount >= PASTE_LINE_THRESHOLD || charCount >= PASTE_CHAR_THRESHOLD) {
      e.preventDefault()

      const newFile: PendingFile = {
        id: nanoid(),
        content: text,
        name: 'Pasted text',
        language: detectLanguage(text),
        lineCount,
        isReference: false,
      }

      setPendingFiles(prev => [...prev, newFile])
    }
    // Otherwise let default paste behavior happen
  }, [setPendingFiles])

  const handleRemoveFile = useCallback((id: string) => {
    setPendingFiles?.(prev => prev.filter(f => f.id !== id))
  }, [setPendingFiles])

  const handleSubmit = async ({ text }: { text: string }) => {
    // Build the message by combining pending files + typed text
    let finalMessage = ''
    const fileBlocks: FileBlock[] = []

    // Add pending file contents
    for (const file of pendingFiles ?? []) {
      if (file.isReference && file.path) {
        // @ references: just add the @path to the message
        finalMessage += `@${file.path}\n\n`
      } else {
        // Pasted content: add to message and track as file block for display
        finalMessage += file.content + '\n\n'
        fileBlocks.push({
          id: file.id,
          content: file.content,
          name: file.name,
          language: file.language,
          lineCount: file.lineCount,
        })
      }
    }

    finalMessage += text

    if (!finalMessage.trim()) return

    // Clear pending files
    setPendingFiles?.([])

    // Send with file blocks for display
    await onSendMessage(finalMessage.trim(), fileBlocks.length > 0 ? fileBlocks : undefined)
  }

  const handleSelectFile = useCallback((filePath: string, isDir: boolean) => {
    const value = controller.textInput.value
    const textarea = textareaRef.current
    const cursorPos = textarea?.selectionStart || value.length

    // Remove the @query from input
    const before = value.slice(0, menu.triggerIndex)
    const after = value.slice(cursorPos)
    const newValue = before + after

    controller.textInput.setInput(newValue.trim())
    closeMenu()

    // Add as pending file reference
    const newFile: PendingFile = {
      id: nanoid(),
      content: '', // No content for references
      name: filePath.split('/').pop() || filePath,
      path: filePath,
      lineCount: 0,
      isReference: true,
      isDirectory: isDir,
    }
    setPendingFiles?.(prev => [...prev, newFile])

    // Focus back to textarea
    setTimeout(() => {
      if (textarea) {
        textarea.focus()
        const newPos = before.length
        textarea.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }, [controller.textInput, menu.triggerIndex, setPendingFiles, closeMenu])

  // Slash command handlers - must be defined before handleKeyDown
  const handleSelectSlashCommand = useCallback((command: SlashCommand) => {
    const value = controller.textInput.value
    const textarea = textareaRef.current
    const cursorPos = textarea?.selectionStart || value.length

    // Remove the /query from input
    const before = value.slice(0, menu.triggerIndex)
    const after = value.slice(cursorPos)
    const newValue = before + after

    controller.textInput.setInput(newValue.trim())
    closeMenu()

    // Trigger the command
    onSlashCommand?.(command)

    // Focus back to textarea
    setTimeout(() => {
      if (textarea) {
        textarea.focus()
      }
    }, 0)
  }, [controller.textInput, menu.triggerIndex, onSlashCommand, closeMenu])

  const handleSlashCommandsChange = useCallback((count: number) => {
    setSlashCommandCount(count)
    updateMenuSelection(0)
  }, [updateMenuSelection])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash menu navigation
    if (menu.type === '/') {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        updateMenuSelection((menu.selectedIndex + 1) % Math.max(1, slashCommandCount))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        updateMenuSelection((menu.selectedIndex - 1 + slashCommandCount) % Math.max(1, slashCommandCount))
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && slashCommandCount > 0) {
        e.preventDefault()
        const selected = selectedSlashCommandRef.current
        if (selected) {
          handleSelectSlashCommand(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
        return
      }
    }

    // Handle @ autocomplete navigation
    if (menu.type !== '@') return

    // Arrow navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      updateMenuSelection((menu.selectedIndex + 1) % Math.max(1, fileCount))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      updateMenuSelection((menu.selectedIndex - 1 + fileCount) % Math.max(1, fileCount))
      return
    }

    // Enter selects current item
    if (e.key === 'Enter' && fileCount > 0) {
      e.preventDefault()
      const selected = selectedFileRef.current
      if (selected) {
        handleSelectFile(selected.path, selected.is_dir)
      }
      return
    }

    // Tab also selects
    if (e.key === 'Tab' && fileCount > 0) {
      e.preventDefault()
      const selected = selectedFileRef.current
      if (selected) {
        handleSelectFile(selected.path, selected.is_dir)
      }
      return
    }

    // Escape closes
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      return
    }
  }, [menu.type, menu.selectedIndex, fileCount, slashCommandCount, handleSelectFile, handleSelectSlashCommand, updateMenuSelection, closeMenu])

  const handleCloseAutocomplete = useCallback(() => {
    closeMenu()
  }, [closeMenu])

  const handleFilesChange = useCallback((count: number) => {
    setFileCount(count)
    // Reset selection when files change
    updateMenuSelection(0)
  }, [updateMenuSelection])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const value = e.currentTarget.value
    const cursorPos = textarea.selectionStart
    const rect = textarea.getBoundingClientRect()
    const position = { top: rect.top, left: rect.left }

    // Check for / at start of input (slash commands)
    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      const query = slashMatch[1]
      openMenu('/', query, 0, position)
      return
    }

    // Find the @ trigger before cursor
    const textBeforeCursor = value.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/(?:^|[\s\n])@([^\s]*)$/)

    if (atMatch) {
      const query = atMatch[1]
      const atIndex = textBeforeCursor.lastIndexOf('@')
      openMenu('@', query, atIndex, position)
    } else {
      // Close menu if no trigger found
      if (menu.type !== null) {
        closeMenu()
      }
    }
  }, [openMenu, closeMenu, menu.type])

  const folderName = workingDirectory?.split('/').pop() || 'No folder'

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className="max-w-4xl mx-auto"
    >
      <PromptInputTextarea
        ref={textareaRef}
        placeholder={`Ask Claude about ${folderName}... (use @ to reference files)`}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
      />

      {/* @ Autocomplete */}
      {menu.type === '@' && (
        <FileAutocomplete
          workingDirectory={workingDirectory}
          query={menu.query}
          position={menu.position}
          selectedIndex={menu.selectedIndex}
          onSelect={handleSelectFile}
          onClose={handleCloseAutocomplete}
          onFilesChange={handleFilesChange}
          onSelectionChange={(file) => { selectedFileRef.current = file }}
        />
      )}

      {/* / Slash commands */}
      {menu.type === '/' && (
        <SlashCommandMenu
          query={menu.query}
          position={menu.position}
          selectedIndex={menu.selectedIndex}
          onSelect={handleSelectSlashCommand}
          onClose={closeMenu}
          onCommandsChange={handleSlashCommandsChange}
          onSelectionChange={(cmd) => { selectedSlashCommandRef.current = cmd }}
        />
      )}

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
    </PromptInput>
  )
}

export function ChatInput(props: ChatInputProps) {
  return (
    <PromptInputProvider>
      <ChatInputInner {...props} />
    </PromptInputProvider>
  )
}
