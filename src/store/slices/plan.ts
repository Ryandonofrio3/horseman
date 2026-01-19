import type { StateCreator } from 'zustand'
import type { AppStore, PlanSlice } from '../types'

export const createPlanSlice: StateCreator<AppStore, [], [], PlanSlice> = (set) => ({
  activePlan: null,

  enterPlanMode: (sessionId, toolId, content) =>
    set({ activePlan: { sessionId, toolId, content, permissionRequestId: null } }),

  setPlanPermissionId: (requestId) =>
    set((state) => ({
      activePlan: state.activePlan
        ? { ...state.activePlan, permissionRequestId: requestId }
        : null,
    })),

  resolvePlan: (action, _feedback) => {
    // State update only - IPC call is caller's responsibility
    // See PlanOverlay component for full resolution flow
    if (action === 'acceptAutoEdits') {
      set({ permissionMode: 'acceptEdits', activePlan: null })
    } else {
      set({ activePlan: null })
    }
  },

  clearPlan: () =>
    set({ activePlan: null }),
})
