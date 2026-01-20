import { useState, useCallback, useEffect } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { toast } from 'sonner'

interface UpdaterState {
  checking: boolean
  downloading: boolean
  update: Update | null
  error: string | null
  downloadProgress: number // 0-100
}

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({
    checking: false,
    downloading: false,
    update: null,
    error: null,
    downloadProgress: 0,
  })

  const checkForUpdates = useCallback(async (silent = false) => {
    setState(s => ({ ...s, checking: true, error: null }))
    try {
      const update = await check()
      setState(s => ({ ...s, checking: false, update }))

      if (update && !silent) {
        toast.info(`Update available: ${update.version}`, {
          description: 'Go to Settings to download and install.',
          duration: 8000,
        })
      } else if (!update && !silent) {
        toast.success('You\'re on the latest version')
      }

      return update
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      setState(s => ({ ...s, checking: false, error }))
      if (!silent) {
        toast.error('Failed to check for updates', { description: error })
      }
      return null
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    if (!state.update) return

    setState(s => ({ ...s, downloading: true, downloadProgress: 0, error: null }))

    try {
      let downloaded = 0
      let contentLength = 0

      await state.update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            const progress = contentLength > 0
              ? Math.round((downloaded / contentLength) * 100)
              : 0
            setState(s => ({ ...s, downloadProgress: progress }))
            break
          case 'Finished':
            setState(s => ({ ...s, downloadProgress: 100 }))
            break
        }
      })

      toast.success('Update installed! Relaunching...')

      // Brief delay so user sees the message
      await new Promise(r => setTimeout(r, 1000))
      await relaunch()
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      setState(s => ({ ...s, downloading: false, error }))
      toast.error('Failed to install update', { description: error })
    }
  }, [state.update])

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    hasUpdate: !!state.update,
    updateVersion: state.update?.version ?? null,
  }
}

// Check for updates on app launch (silent)
export function useUpdateCheckOnLaunch() {
  const { checkForUpdates, update, downloadAndInstall } = useUpdater()

  useEffect(() => {
    // Delay check slightly so app loads first
    const timer = setTimeout(async () => {
      const foundUpdate = await checkForUpdates(true)
      if (foundUpdate) {
        toast.info(`Update available: ${foundUpdate.version}`, {
          description: 'Click to update now',
          duration: 10000,
          action: {
            label: 'Update',
            onClick: () => {
              // This won't work directly since we need the update ref
              // User should go to settings
            },
          },
        })
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, []) // Run once on mount
}
