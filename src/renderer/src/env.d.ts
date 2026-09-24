import type { DownloadPayload, DownloadResult, ProgressUpdate, VideoInfo } from '../../shared/types'

declare global {
  interface Window {
    yt: {
      getInfo(url: string): Promise<VideoInfo>
      download(payload: DownloadPayload): Promise<DownloadResult>
      cancelDownload(): void
      estimateSize(url: string, height: number, startSec: number, endSec: number): Promise<number>
      openFolder(filePath: string): Promise<void>
      openVideo(filePath: string): Promise<string>
      onProgress(cb: (p: ProgressUpdate) => void): void
    }
  }
}

export {}
