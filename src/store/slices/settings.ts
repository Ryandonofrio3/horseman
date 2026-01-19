import type { StateCreator } from 'zustand'
import type { AppStore, SettingsSlice, ModelAlias, PermissionMode, SortOrder } from '../types'

const MODEL_ORDER: ModelAlias[] = ['sonnet', 'opus', 'haiku']
const MODE_ORDER: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'bypassPermissions']

export const createSettingsSlice: StateCreator<AppStore, [], [], SettingsSlice> = (set) => ({
  theme: 'system',
  sidebarCollapsed: false,
  model: 'opus',
  hiddenFolders: [],
  sortOrder: 'recent',
  permissionMode: 'default',

  setTheme: (theme) =>
    set({ theme }),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) =>
    set({ sidebarCollapsed: collapsed }),

  setModel: (model) =>
    set({ model }),

  cycleModel: () =>
    set((state) => {
      const currentIndex = MODEL_ORDER.indexOf(state.model)
      const nextIndex = (currentIndex + 1) % MODEL_ORDER.length
      return { model: MODEL_ORDER[nextIndex] }
    }),

  hideFolder: (path) =>
    set((state) => {
      if (state.hiddenFolders.includes(path)) return state
      // Close all tabs from sessions in this folder
      const sessionsInFolder = Object.values(state.sessions)
        .map((s) => s.session)
        .filter((s) => s.workingDirectory === path)
      const sessionIdsToClose = new Set(sessionsInFolder.map((s) => s.id))
      const newOpenTabIds = state.openTabIds.filter((id) => !sessionIdsToClose.has(id))
      // If active session is in this folder, switch to another tab
      let newActiveSessionId = state.activeSessionId
      if (state.activeSessionId && sessionIdsToClose.has(state.activeSessionId)) {
        newActiveSessionId = newOpenTabIds.length > 0 ? newOpenTabIds[0] : null
      }
      return {
        hiddenFolders: [...state.hiddenFolders, path],
        openTabIds: newOpenTabIds,
        activeSessionId: newActiveSessionId,
      }
    }),

  unhideFolder: (path) =>
    set((state) => ({
      hiddenFolders: state.hiddenFolders.filter((p) => p !== path),
    })),

  setSortOrder: (order: SortOrder) =>
    set({ sortOrder: order }),

  setPermissionMode: (mode) =>
    set({ permissionMode: mode }),

  cyclePermissionMode: () =>
    set((state) => {
      const currentIndex = MODE_ORDER.indexOf(state.permissionMode)
      const nextIndex = (currentIndex + 1) % MODE_ORDER.length
      return { permissionMode: MODE_ORDER[nextIndex] }
    }),
})
