import type { StateCreator } from 'zustand'
import type { AppStore, SlashSlice, SlashState } from '../types'

const EMPTY_SLASH_STATE: SlashState = {
  activeCommandId: null,
  activeCommand: null,
  isRunning: false,
  output: '',
  error: null,
  detectionMethod: null,
}

export const createSlashSlice: StateCreator<AppStore, [], [], SlashSlice> = (set) => ({
  slash: { ...EMPTY_SLASH_STATE },

  beginSlashCommand: (command?: string) =>
    set(() => ({
      slash: { ...EMPTY_SLASH_STATE, isRunning: true, activeCommand: command ?? null },
    })),

  startSlashCommand: (commandId: string) =>
    set((state) => ({
      slash: { ...EMPTY_SLASH_STATE, isRunning: true, activeCommandId: commandId, activeCommand: state.slash.activeCommand },
    })),

  setSlashCommandId: (commandId: string) =>
    set((state) => {
      if (state.slash.activeCommandId && state.slash.activeCommandId !== commandId) {
        return state
      }
      return {
        slash: {
          ...state.slash,
          activeCommandId: commandId,
        },
      }
    }),

  appendSlashOutput: (commandId: string, data: string) =>
    set((state) => {
      if (state.slash.activeCommandId && state.slash.activeCommandId !== commandId) {
        return state
      }
      return {
        slash: {
          ...state.slash,
          activeCommandId: state.slash.activeCommandId ?? commandId,
          output: state.slash.output + data,
        },
      }
    }),

  setSlashDetectionMethod: (commandId: string, method: string) =>
    set((state) => {
      if (state.slash.activeCommandId && state.slash.activeCommandId !== commandId) {
        return state
      }
      return {
        slash: {
          ...state.slash,
          activeCommandId: state.slash.activeCommandId ?? commandId,
          detectionMethod: method,
        },
      }
    }),

  endSlashCommand: (commandId: string) =>
    set((state) => {
      if (state.slash.activeCommandId && state.slash.activeCommandId !== commandId) {
        return state
      }
      return {
        slash: {
          ...state.slash,
          isRunning: false,
          activeCommandId: null,
        },
      }
    }),

  failSlashCommand: (commandId: string | null, message: string) =>
    set((state) => {
      if (commandId && state.slash.activeCommandId && state.slash.activeCommandId !== commandId) {
        return state
      }
      return {
        slash: {
          ...state.slash,
          isRunning: false,
          activeCommandId: null,
          error: message,
        },
      }
    }),

  resetSlashState: () =>
    set(() => ({
      slash: { ...EMPTY_SLASH_STATE },
    })),
})
