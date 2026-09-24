import { contextBridge, ipcRenderer } from 'electron'
import type { DownloadPayload, DownloadResult, ProgressUpdate, VideoInfo } from '../shared/types'

contextBridge.exposeInMainWorld('yt', {
  getInfo: (url: string): Promise<VideoInfo> => ipcRenderer.invoke('yt:info', url),
  download: (payload: DownloadPayload): Promise<DownloadResult> => ipcRenderer.invoke('yt:download', payload),
  estimateSize: (url: string, height: number, startSec: number, endSec: number): Promise<number> =>
    ipcRenderer.invoke('yt:size', url, height, startSec, endSec),
  openFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('yt:open-folder', filePath),
  openVideo: (filePath: string): Promise<string> => ipcRenderer.invoke('yt:open-video', filePath),
  onProgress: (cb: (p: ProgressUpdate) => void): void => {
    ipcRenderer.on('yt:progress', (_e, p: ProgressUpdate) => cb(p))
  }
})
