import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'node:path'
import { getInfo, downloadSection, estimateSectionSize, cancelDownload } from './ytdlp'
import { buildClipFilename } from '../shared/format'
import type { DownloadPayload, DownloadResult } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  ipcMain.handle('yt:info', (_e, url: string) => getInfo(url))

  ipcMain.handle('yt:download', async (e, payload: DownloadPayload): Promise<DownloadResult> => {
    const saveOpts: Electron.SaveDialogOptions = {
      defaultPath: join(app.getPath('downloads'), buildClipFilename(payload.title, payload.startSec, payload.endSec)),
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
    }
    const { canceled, filePath } = mainWindow
      ? await dialog.showSaveDialog(mainWindow, saveOpts)
      : await dialog.showSaveDialog(saveOpts)
    if (canceled || !filePath) return { canceled: true }

    const wasCanceled = await downloadSection(payload.url, payload.height, payload.startSec, payload.endSec, payload.totalBytes, filePath, (p) => {
      e.sender.send('yt:progress', p)
    })
    return wasCanceled ? { canceled: true } : { canceled: false, filePath }
  })

  ipcMain.on('yt:cancel', () => cancelDownload())

  ipcMain.handle('yt:size', (_e, url: string, height: number, startSec: number, endSec: number) => {
    return estimateSectionSize(url, height, startSec, endSec)
  })

  ipcMain.handle('yt:open-folder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('yt:open-video', (_e, filePath: string) => {
    return shell.openPath(filePath)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
