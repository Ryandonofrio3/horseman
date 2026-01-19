import type { StateCreator } from 'zustand'
import type { AppStore, PermissionsSlice, PendingPermission } from '../types'

export const createPermissionsSlice: StateCreator<AppStore, [], [], PermissionsSlice> = (set, get) => ({
  pendingPermissions: [],

  addPendingPermission: (permission: PendingPermission) =>
    set((state) => ({
      pendingPermissions: [...state.pendingPermissions, permission],
    })),

  removePendingPermission: (requestId: string) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((p) => p.requestId !== requestId),
    })),

  clearPendingPermissions: (sessionId: string) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((p) => p.sessionId !== sessionId),
    })),

  getNextPendingPermission: () => {
    const { pendingPermissions } = get()
    return pendingPermissions[0] ?? null
  },
})
