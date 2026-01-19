import { appDataDir } from '@tauri-apps/api/path'
import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
} from '@tauri-apps/plugin-fs'
import type { StateStorage } from 'zustand/middleware'

const STATE_FILE = 'state.json'
let cachedBasePath: string | null = null
let writeTimeout: ReturnType<typeof setTimeout> | null = null
let pendingWrite: string | null = null

async function getBasePath(): Promise<string> {
  if (cachedBasePath) return cachedBasePath
  cachedBasePath = await appDataDir()
  return cachedBasePath
}

async function ensureDir(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true })
  }
}

async function getStatePath(): Promise<string> {
  const base = await getBasePath()
  await ensureDir(base)
  return `${base}${STATE_FILE}`
}

// Debounced write - 500ms
async function debouncedWrite(value: string): Promise<void> {
  pendingWrite = value

  if (writeTimeout) {
    clearTimeout(writeTimeout)
  }

  writeTimeout = setTimeout(async () => {
    if (pendingWrite === null) return
    try {
      const path = await getStatePath()
      await writeTextFile(path, pendingWrite)
      pendingWrite = null
    } catch (err) {
      console.error('[storage] Write failed:', err)
    }
  }, 500)
}

export const tauriStorage: StateStorage = {
  getItem: async (_name: string): Promise<string | null> => {
    try {
      const path = await getStatePath()
      if (!(await exists(path))) {
        return null
      }
      const content = await readTextFile(path)
      return content
    } catch (err) {
      console.error('[storage] Read failed:', err)
      return null
    }
  },

  setItem: async (_name: string, value: string): Promise<void> => {
    await debouncedWrite(value)
  },

  removeItem: async (_name: string): Promise<void> => {
    try {
      const path = await getStatePath()
      await writeTextFile(path, '{}')
    } catch (err) {
      console.error('[storage] Remove failed:', err)
    }
  },
}
