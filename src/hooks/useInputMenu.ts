import { useState, useCallback, useRef, type RefObject } from 'react'
import type { FileEntry } from '@/lib/ipc'
import type { SlashCommand } from '@/components/chat/SlashCommandMenu'

export type MenuType = '@' | '/' | null

export interface MenuState {
  type: MenuType
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

interface UseInputMenuOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function useInputMenu({ textareaRef }: UseInputMenuOptions) {
  const [menu, setMenu] = useState<MenuState>(initialMenuState)
  const [fileCount, setFileCount] = useState(0)
  const [slashCommandCount, setSlashCommandCount] = useState(0)

  // Refs for selected items
  const selectedFileRef = useRef<FileEntry | null>(null)
  const selectedSlashCommandRef = useRef<SlashCommand | null>(null)

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

  const handleFilesChange = useCallback((count: number) => {
    setFileCount(count)
    setMenu(prev => ({ ...prev, selectedIndex: 0 }))
  }, [])

  const handleSlashCommandsChange = useCallback((count: number) => {
    setSlashCommandCount(count)
    setMenu(prev => ({ ...prev, selectedIndex: 0 }))
  }, [])

  // Navigate menu selection
  const navigateMenu = useCallback((direction: 'up' | 'down') => {
    const count = menu.type === '@' ? fileCount : slashCommandCount
    if (count === 0) return

    setMenu(prev => {
      const newIndex = direction === 'down'
        ? (prev.selectedIndex + 1) % count
        : (prev.selectedIndex - 1 + count) % count
      return { ...prev, selectedIndex: newIndex }
    })
  }, [menu.type, fileCount, slashCommandCount])

  // Check text for menu triggers
  const checkForTriggers = useCallback((value: string, cursorPos: number, rect: DOMRect) => {
    const position = { top: rect.top, left: rect.left }

    // Check for / at start of input (slash commands)
    const slashMatch = value.match(/^\/(\S*)$/)
    if (slashMatch) {
      openMenu('/', slashMatch[1], 0, position)
      return
    }

    // Find the @ trigger before cursor
    const textBeforeCursor = value.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/(?:^|[\s\n])@([^\s]*)$/)

    if (atMatch) {
      const atIndex = textBeforeCursor.lastIndexOf('@')
      openMenu('@', atMatch[1], atIndex, position)
    } else if (menu.type !== null) {
      closeMenu()
    }
  }, [openMenu, closeMenu, menu.type])

  return {
    menu,
    fileCount,
    slashCommandCount,
    selectedFileRef,
    selectedSlashCommandRef,
    closeMenu,
    openMenu,
    updateMenuQuery,
    updateMenuSelection,
    handleFilesChange,
    handleSlashCommandsChange,
    navigateMenu,
    checkForTriggers,
  }
}
