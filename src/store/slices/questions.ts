import type { StateCreator } from 'zustand'
import type { AppStore, QuestionsSlice, PendingQuestion } from '../types'

export const createQuestionsSlice: StateCreator<AppStore, [], [], QuestionsSlice> = (set) => ({
  pendingQuestions: [],

  addPendingQuestion: (question: PendingQuestion) =>
    set((state) => ({
      pendingQuestions: [...state.pendingQuestions, question],
    })),

  removePendingQuestion: (requestId: string) =>
    set((state) => ({
      pendingQuestions: state.pendingQuestions.filter((q) => q.requestId !== requestId),
    })),

  clearPendingQuestions: (sessionId: string) =>
    set((state) => ({
      pendingQuestions: state.pendingQuestions.filter((q) => q.sessionId !== sessionId),
    })),
})
