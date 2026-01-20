import { useCallback, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import { nanoid } from 'nanoid'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputProvider,
  usePromptInputController,
} from '@/components/ai-elements/prompt-input'
import { FileAutocomplete } from './FileAutocomplete'
import { SlashCommandMenu, type SlashCommand } from './SlashCommandMenu'
import { ChatInputFooter } from './ChatInputFooter'
import { useInputMenu } from '@/hooks/useInputMenu'
import { extractFileRefs } from './InlineFileRef'
import type { SessionUsage, FileBlock, PendingFile } from '@/domain'

// Thresholds for converting paste to file pill
const PASTE_LINE_THRESHOLD = 50
const PASTE_CHAR_THRESHOLD = 5000

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

  const {
    menu,
    fileCount,
    slashCommandCount,
    selectedFileRef,
    selectedSlashCommandRef,
    closeMenu,
    navigateMenu,
    handleFilesChange,
    handleSlashCommandsChange,
    checkForTriggers,
  } = useInputMenu({ textareaRef })

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData?.getData('text/plain')
    if (!text) return

    const lineCount = text.split('\n').length
    if (lineCount >= PASTE_LINE_THRESHOLD || text.length >= PASTE_CHAR_THRESHOLD) {
      e.preventDefault()
      setPendingFiles(prev => [...prev, {
        id: nanoid(),
        content: text,
        name: 'Pasted text',
        lineCount,
        isReference: false,
      }])
    }
  }, [setPendingFiles])

  const handleSubmit = async ({ text }: { text: string }) => {
    let finalMessage = ''
    const fileBlocks: FileBlock[] = []

    // Only process non-reference files (pasted content)
    // Reference files are already inline as @path in the text
    for (const file of pendingFiles) {
      if (!file.isReference) {
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

    setPendingFiles([])
    await onSendMessage(finalMessage.trim(), fileBlocks.length > 0 ? fileBlocks : undefined)
  }

  const handleSelectFile = useCallback((filePath: string, isDir: boolean) => {
    const value = controller.textInput.value
    const textarea = textareaRef.current
    const cursorPos = textarea?.selectionStart || value.length
    const before = value.slice(0, menu.triggerIndex)
    const after = value.slice(cursorPos)

    // Keep @path inline, add space after
    const suffix = isDir ? '/' : ''
    const newText = `${before}@${filePath}${suffix} ${after.trimStart()}`
    controller.textInput.setInput(newText)
    closeMenu()

    // Also add preview pill above
    setPendingFiles(prev => [...prev, {
      id: nanoid(),
      content: '',
      name: filePath.split('/').pop() || filePath,
      path: filePath,
      lineCount: 0,
      isReference: true,
      isDirectory: isDir,
    }])

    // Position cursor after the space
    const newCursorPos = before.length + 1 + filePath.length + suffix.length + 1
    setTimeout(() => {
      textarea?.focus()
      textarea?.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }, [controller.textInput, menu.triggerIndex, setPendingFiles, closeMenu])

  const handleSelectSlashCommand = useCallback((command: SlashCommand) => {
    const value = controller.textInput.value
    const textarea = textareaRef.current
    const cursorPos = textarea?.selectionStart || value.length
    const before = value.slice(0, menu.triggerIndex)
    const after = value.slice(cursorPos)

    controller.textInput.setInput((before + after).trim())
    closeMenu()
    onSlashCommand?.(command)
    setTimeout(() => textarea?.focus(), 0)
  }, [controller.textInput, menu.triggerIndex, onSlashCommand, closeMenu])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!menu.type) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      navigateMenu('down')
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      navigateMenu('up')
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      return
    }

    const count = menu.type === '@' ? fileCount : slashCommandCount
    if ((e.key === 'Enter' || e.key === 'Tab') && count > 0) {
      e.preventDefault()
      if (menu.type === '@') {
        const selected = selectedFileRef.current
        if (selected) handleSelectFile(selected.path, selected.is_dir)
      } else {
        const selected = selectedSlashCommandRef.current
        if (selected) handleSelectSlashCommand(selected)
      }
    }
  }, [menu.type, fileCount, slashCommandCount, navigateMenu, closeMenu, handleSelectFile, handleSelectSlashCommand, selectedFileRef, selectedSlashCommandRef])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const text = textarea.value
    checkForTriggers(text, textarea.selectionStart, textarea.getBoundingClientRect())

    // Sync pills with text - remove reference pills whose @path is no longer in text
    const { filePaths } = extractFileRefs(text)
    // Normalize paths (strip trailing slash for directory comparison)
    const pathsInText = new Set(filePaths.map(p => p.replace(/\/$/, '')))
    setPendingFiles(prev => {
      const filtered = prev.filter(f => !f.isReference || (f.path && pathsInText.has(f.path)))
      // Only update if something changed (avoid unnecessary re-renders)
      return filtered.length === prev.length ? prev : filtered
    })
  }, [checkForTriggers, setPendingFiles])

  const folderName = workingDirectory?.split('/').pop() || 'No folder'

  return (
    <PromptInput onSubmit={handleSubmit} className="max-w-4xl mx-auto">
      <PromptInputTextarea
        ref={textareaRef}
        placeholder={`Ask Claude about ${folderName}... (use @ to reference files)`}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
      />

      {menu.type === '@' && (
        <FileAutocomplete
          workingDirectory={workingDirectory}
          query={menu.query}
          position={menu.position}
          selectedIndex={menu.selectedIndex}
          onSelect={handleSelectFile}
          onClose={closeMenu}
          onFilesChange={handleFilesChange}
          onSelectionChange={(file) => { selectedFileRef.current = file }}
        />
      )}

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

      <ChatInputFooter
        workingDirectory={workingDirectory}
        isWorking={isWorking}
        usage={usage}
        onStop={onStop}
      />
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
