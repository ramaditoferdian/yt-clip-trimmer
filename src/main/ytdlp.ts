import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { ytdlpPath, ffmpegPath } from './binaries'
import {
  buildFormatExpr,
  extractHeights,
  parseFfmpegProgress,
  parseFfmpegTotalSize,
  parseHlsSegments,
  estimateSectionBytes,
  HlsSegment
} from './lib'
import type { VideoInfo, ProgressUpdate } from '../shared/types'

function run(binary: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? -1 }))
  })
}

function cleanYtdlpError(stderr: string): string {
  const lines = stderr.trim().split('\n').filter(Boolean)
  const last = lines[lines.length - 1] ?? ''
  const m = last.match(/ERROR:\s*(.*)/)
  return m ? m[1] : last || 'Unknown yt-dlp error'
}

export async function getInfo(url: string): Promise<VideoInfo> {
  const { stdout, stderr, code } = await run(ytdlpPath(), ['-J', '--no-warnings', '--no-playlist', url])
  if (code !== 0) throw new Error(cleanYtdlpError(stderr))
  const info = JSON.parse(stdout)
  const formats: any[] = info.formats ?? []
  const bitrates: Record<number, number> = {}
  let audioTbr = 128
  for (const f of formats) {
    const tbr = Number(f.tbr) || 0
    if (f.protocol === 'm3u8_native' && typeof f.height === 'number' && f.height > 0) {
      bitrates[f.height] = Math.max(bitrates[f.height] ?? 0, tbr)
    }
    const abr = Number(f.abr) || 0
    if (f.vcodec === 'none' && abr > 0) audioTbr = Math.max(audioTbr, abr)
  }
  return {
    id: info.id ?? '',
    title: info.title ?? 'Untitled',
    duration: info.duration ?? 0,
    thumbnail: info.thumbnail ?? '',
    qualities: extractHeights(formats),
    bitrates,
    audioTbr
  }
}

async function getStreamUrls(url: string, height: number): Promise<{ videoUrl: string; audioUrl: string }> {
  const { stdout, stderr, code } = await run(
    ytdlpPath(),
    ['-f', buildFormatExpr(height), '-g', '--no-warnings', '--no-playlist', url]
  )
  if (code !== 0) throw new Error(cleanYtdlpError(stderr))
  const lines = stdout.trim().split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('Could not resolve video + audio streams')
  return { videoUrl: lines[0], audioUrl: lines[1] }
}

async function fetchManifest(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

const segmentCache = new Map<string, { video: HlsSegment[]; audio: HlsSegment[] }>()

async function getSegments(url: string, height: number): Promise<{ video: HlsSegment[]; audio: HlsSegment[] }> {
  const key = `${url}|${height}`
  const cached = segmentCache.get(key)
  if (cached) return cached
  const { videoUrl, audioUrl } = await getStreamUrls(url, height)
  const [videoManifest, audioManifest] = await Promise.all([fetchManifest(videoUrl), fetchManifest(audioUrl)])
  const result = {
    video: parseHlsSegments(videoManifest),
    audio: parseHlsSegments(audioManifest)
  }
  segmentCache.set(key, result)
  return result
}

export async function estimateSectionSize(url: string, height: number, startSec: number, endSec: number): Promise<number> {
  const { video, audio } = await getSegments(url, height)
  return estimateSectionBytes(video, startSec, endSec) + estimateSectionBytes(audio, startSec, endSec)
}

let activeChild: ReturnType<typeof spawn> | null = null
let cancelRequested = false

export function cancelDownload(): void {
  cancelRequested = true
  activeChild?.kill()
}

export async function downloadSection(
  url: string,
  height: number,
  startSec: number,
  endSec: number,
  totalBytes: number,
  outPath: string,
  onProgress: (p: ProgressUpdate) => void
): Promise<boolean> {
  const { videoUrl, audioUrl } = await getStreamUrls(url, height)
  const duration = endSec - startSec
  const args = [
    '-y',
    '-ss', String(startSec), '-i', videoUrl,
    '-ss', String(startSec), '-i', audioUrl,
    '-t', String(duration),
    '-map', '0:v:0', '-map', '1:a:0',
    '-c', 'copy',
    '-movflags', '+faststart',
    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    '-progress', 'pipe:1',
    '-nostats',
    outPath
  ]
  cancelRequested = false
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath() ?? 'ffmpeg', args, { windowsHide: true })
    activeChild = child
    let stderr = ''
    let currentSize = 0
    let lastSize = 0
    let lastTime = Date.now()
    let speed = 0
    let lastPct = 0
    child.stdout.on('data', (d) => {
      for (const line of d.toString().split('\n')) {
        let changed = false
        const sec = parseFfmpegProgress(line)
        if (sec !== null && duration > 0) {
          lastPct = Math.min(100, (sec / duration) * 100)
          changed = true
        }
        const size = parseFfmpegTotalSize(line)
        if (size !== null) {
          currentSize = size
          const now = Date.now()
          const dt = (now - lastTime) / 1000
          if (dt >= 0.3) {
            speed = (size - lastSize) / dt
            lastSize = size
            lastTime = now
          }
          changed = true
        }
        if (changed) onProgress({ pct: lastPct, speed, downloaded: currentSize, total: totalBytes })
      }
    })
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      activeChild = null
      reject(err)
    })
    child.on('close', (code) => {
      activeChild = null
      if (cancelRequested || code === 0) resolve()
      else {
        const tail = stderr.trim().split('\n').slice(-3).join(' ')
        reject(new Error(tail || 'ffmpeg failed'))
      }
    })
  })
  if (cancelRequested) {
    await rm(outPath, { force: true }).catch(() => {})
    return true
  }
  return false
}
