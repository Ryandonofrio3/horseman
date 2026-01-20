import type { StateCreator } from 'zustand'
import type { AppStore, DraftSlice } from '../types'

export const createDraftSlice: StateCreator<AppStore, [], [], DraftSlice> = (set) => ({
  drafts: {},

  setDraft: (sessionId: string, text: string) =>
    set((state) => {
      // Don't update if unchanged (avoid unnecessary re-renders)
      if (state.drafts[sessionId] === text) return state
      return {
        drafts: { ...state.drafts, [sessionId]: text },
      }
    }),

  clearDraft: (sessionId: string) =>
    set((state) => {
      if (!(sessionId in state.drafts)) return state
      const { [sessionId]: _, ...rest } = state.drafts
      return { drafts: rest }
    }),
})
