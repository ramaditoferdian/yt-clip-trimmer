export interface VideoInfo {
  id: string
  title: string
  duration: number
  thumbnail: string
  qualities: number[]
  bitrates: Record<number, number>
  audioTbr: number
}

export interface DownloadPayload {
  url: string
  height: number
  startSec: number
  endSec: number
  title: string
  totalBytes: number
}

export interface DownloadResult {
  canceled: boolean
  filePath?: string
}

export interface ProgressUpdate {
  pct: number
  speed: number
  downloaded: number
  total: number
}
