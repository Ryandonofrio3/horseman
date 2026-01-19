import { useState, useCallback, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
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

  // @ autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteQuery, setAutocompleteQuery] = useState('')
  const [autocompletePosition, setAutocompletePosition] = useState<{ top: number; left: number } | null>(null)
  const [atTriggerIndex, setAtTriggerIndex] = useState<number>(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [fileCount, setFileCount] = useState(0)

  // / slash command state
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashTriggerIndex, setSlashTriggerIndex] = useState<number>(-1)
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const [slashCommandCount, setSlashCommandCount] = useState(0)
  const [slashPosition, setSlashPosition] = useState<{ top: number; left: number } | null>(null)

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
    const before = value.slice(0, atTriggerIndex)
    const after = value.slice(cursorPos)
    const newValue = before + after

    controller.textInput.setInput(newValue.trim())
    setShowAutocomplete(false)
    setSelectedIndex(0)

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
  }, [controller.textInput, atTriggerIndex, setPendingFiles])

  // Slash command handlers - must be defined before handleKeyDown
  const handleSelectSlashCommand = useCallback((command: SlashCommand) => {
    const value = controller.textInput.value
    const textarea = textareaRef.current
    const cursorPos = textarea?.selectionStart || value.length

    // Remove the /query from input
    const before = value.slice(0, slashTriggerIndex)
    const after = value.slice(cursorPos)
    const newValue = before + after

    controller.textInput.setInput(newValue.trim())
    setShowSlashMenu(false)
    setSlashSelectedIndex(0)

    // Trigger the command
    onSlashCommand?.(command)

    // Focus back to textarea
    setTimeout(() => {
      if (textarea) {
        textarea.focus()
      }
    }, 0)
  }, [controller.textInput, slashTriggerIndex, onSlashCommand])

  const handleCloseSlashMenu = useCallback(() => {
    setShowSlashMenu(false)
    setSlashSelectedIndex(0)
  }, [])

  const handleSlashCommandsChange = useCallback((count: number) => {
    setSlashCommandCount(count)
    setSlashSelectedIndex(0)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash menu navigation
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashSelectedIndex(prev => (prev + 1) % Math.max(1, slashCommandCount))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashSelectedIndex(prev => (prev - 1 + slashCommandCount) % Math.max(1, slashCommandCount))
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && slashCommandCount > 0) {
        e.preventDefault()
        const selected = (window as unknown as Record<string, SlashCommand>).__slashCommandSelected
        if (selected) {
          handleSelectSlashCommand(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSlashMenu(false)
        setSlashSelectedIndex(0)
        return
      }
    }

    // Handle @ autocomplete navigation
    if (!showAutocomplete) return

    // Arrow navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % Math.max(1, fileCount))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + fileCount) % Math.max(1, fileCount))
      return
    }

    // Enter selects current item
    if (e.key === 'Enter' && fileCount > 0) {
      e.preventDefault()
      const selected = (window as unknown as Record<string, { path: string; isDir: boolean }>).__autocompleteSelected
      if (selected) {
        handleSelectFile(selected.path, selected.isDir)
      }
      return
    }

    // Tab also selects
    if (e.key === 'Tab' && fileCount > 0) {
      e.preventDefault()
      const selected = (window as unknown as Record<string, { path: string; isDir: boolean }>).__autocompleteSelected
      if (selected) {
        handleSelectFile(selected.path, selected.isDir)
      }
      return
    }

    // Escape closes
    if (e.key === 'Escape') {
      e.preventDefault()
      setShowAutocomplete(false)
      setSelectedIndex(0)
      return
    }
  }, [showAutocomplete, showSlashMenu, fileCount, slashCommandCount, handleSelectFile, handleSelectSlashCommand])

  const handleCloseAutocomplete = useCallback(() => {
    setShowAutocomplete(false)
    setSelectedIndex(0)
  }, [])

  const handleFilesChange = useCallback((count: number) => {
    setFileCount(count)
    // Reset selection when files change
    setSelectedIndex(0)
  }, [])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const value = e.currentTarget.value
    const cursorPos = textarea.selectionStart

    // Check for / at start of input (slash commands)
    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      const query = slashMatch[1]
      setSlashTriggerIndex(0)
      setSlashQuery(query)
      setShowSlashMenu(true)
      setShowAutocomplete(false)
      // Calculate position for menu
      const rect = textarea.getBoundingClientRect()
      setSlashPosition({
        top: rect.top,
        left: rect.left,
      })
      return
    } else {
      setShowSlashMenu(false)
    }

    // Find the @ trigger before cursor
    const textBeforeCursor = value.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/(?:^|[\s\n])@([^\s]*)$/)

    if (atMatch) {
      const query = atMatch[1]
      const atIndex = textBeforeCursor.lastIndexOf('@')

      setAtTriggerIndex(atIndex)
      setAutocompleteQuery(query)
      setShowAutocomplete(true)

      // Calculate position for popover (simplified - at textarea level)
      const rect = textarea.getBoundingClientRect()
      setAutocompletePosition({
        top: rect.top,
        left: rect.left,
      })
    } else {
      setShowAutocomplete(false)
    }
  }, [])

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
      {showAutocomplete && (
        <FileAutocomplete
          workingDirectory={workingDirectory}
          query={autocompleteQuery}
          position={autocompletePosition}
          selectedIndex={selectedIndex}
          onSelect={handleSelectFile}
          onClose={handleCloseAutocomplete}
          onFilesChange={handleFilesChange}
        />
      )}

      {/* / Slash commands */}
      {showSlashMenu && (
        <SlashCommandMenu
          query={slashQuery}
          position={slashPosition}
          selectedIndex={slashSelectedIndex}
          onSelect={handleSelectSlashCommand}
          onClose={handleCloseSlashMenu}
          onCommandsChange={handleSlashCommandsChange}
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
