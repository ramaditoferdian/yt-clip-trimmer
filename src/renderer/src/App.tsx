import { useEffect, useRef, useState } from 'react'
import type { ProgressUpdate, VideoInfo } from '../../shared/types'
import { formatHMS, parseHMS, estimateBytes } from '../../shared/format'

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<any> | null = null
function loadYouTubeApi(): Promise<any> {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiPromise
}

function fmtSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${Math.round(bytes)} B`
}

export default function App() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [startText, setStartText] = useState('00:00:00')
  const [endText, setEndText] = useState('00:00:00')
  const [height, setHeight] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  const [sizeEstimate, setSizeEstimate] = useState<number | null>(null)
  const playerHostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)

  useEffect(() => {
    window.yt.onProgress((p) => setProgress(p))
  }, [])

  useEffect(() => {
    return () => {
      try {
        playerRef.current?.destroy()
      } catch {}
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!info || height == null || end <= start) {
      setSizeEstimate(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const bytes = await window.yt.estimateSize(url, height, start, end)
        if (!cancelled) setSizeEstimate(bytes > 0 ? bytes : null)
      } catch {
        if (!cancelled) setSizeEstimate(null)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [url, height, start, end, info])

  function seekTo(sec: number) {
    const p = playerRef.current
    if (p && p.seekTo) p.seekTo(sec, true)
  }

  function applyStart(sec: number) {
    setStart(sec)
    setStartText(formatHMS(sec))
    seekTo(sec)
  }

  function applyEnd(sec: number) {
    setEnd(sec)
    setEndText(formatHMS(sec))
    seekTo(sec)
  }

  async function load() {
    if (!url.trim()) return
    try {
      setStatus('Loading…')
      setProgress(null)
      const i = await window.yt.getInfo(url)
      if (!i.id) throw new Error('Could not extract video ID')
      setInfo(i)
      setEnd(Math.round(i.duration))
      setEndText(formatHMS(i.duration))
      setStart(0)
      setStartText('00:00:00')
      setHeight(i.qualities[0] ?? null)
      setStatus('')

      try {
        playerRef.current?.destroy()
      } catch {}
      const YT = await loadYouTubeApi()
      playerRef.current = new YT.Player(playerHostRef.current, {
        videoId: i.id,
        width: '100%',
        height: '100%'
      })
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  async function download() {
    if (!info || height == null) return
    try {
      setStatus('Downloading…')
      setProgress(null)
      const totalBytes = sizeEstimate ?? estimateBytes((info.bitrates[height] ?? 0) + info.audioTbr, end - start)
      const res = await window.yt.download({ url, height, startSec: start, endSec: end, title: info.title, totalBytes })
      if (res.canceled) {
        setStatus('')
        setSavedPath(null)
      } else {
        setStatus('')
        setSavedPath(res.filePath ?? null)
      }
    } catch (err) {
      setSavedPath(null)
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  function setFromPlayer(which: 'start' | 'end') {
    const p = playerRef.current
    const t = Math.round(p && p.getCurrentTime ? p.getCurrentTime() : 0)
    if (which === 'start') applyStart(t)
    else applyEnd(t)
  }

  const duration = info?.duration ?? 0

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20 }}>YT Clip Trimmer</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="Paste YouTube URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button style={{ padding: '8px 16px' }} onClick={load} disabled={!url.trim()}>
          Load
        </button>
      </div>

      {info && (
        <div style={{ marginBottom: 8 }}>
          <strong>{info.title}</strong>
        </div>
      )}

      <div ref={playerHostRef} className="player-host" />

      {info && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <button style={{ marginRight: 8 }} onClick={() => setFromPlayer('start')}>
              Set start (current time)
            </button>
            <button style={{ marginRight: 8 }} onClick={() => setFromPlayer('end')}>
              Set end (current time)
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label>
              Start{' '}
              <input
                value={startText}
                onChange={(e) => {
                  setStartText(e.target.value)
                  const s = parseHMS(e.target.value)
                  if (s !== null) {
                    setStart(s)
                    seekTo(s)
                  }
                }}
                onBlur={() => setStartText(formatHMS(start))}
                style={{ width: 90, padding: 6, textAlign: 'center' }}
              />
            </label>
            <label>
              End{' '}
              <input
                value={endText}
                onChange={(e) => {
                  setEndText(e.target.value)
                  const s = parseHMS(e.target.value)
                  if (s !== null) {
                    setEnd(s)
                    seekTo(s)
                  }
                }}
                onBlur={() => setEndText(formatHMS(end))}
                style={{ width: 90, padding: 6, textAlign: 'center' }}
              />
            </label>
            <span style={{ color: '#999' }}>HH:MM:SS</span>
          </div>

          <div className="scrubber">
            <div className="scrubber__track" />
            <div
              className="scrubber__fill"
              style={{
                left: `${duration > 0 ? (start / duration) * 100 : 0}%`,
                width: `${duration > 0 ? ((end - start) / duration) * 100 : 0}%`
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <span style={{ marginRight: 6, color: '#999' }}>Start:</span>
              <button onClick={() => applyStart(start - 1)}>−1s</button>
              <button onClick={() => applyStart(start + 1)}>+1s</button>
            </div>
            <div>
              <span style={{ marginRight: 6, color: '#999' }}>End:</span>
              <button onClick={() => applyEnd(end - 1)}>−1s</button>
              <button onClick={() => applyEnd(end + 1)}>+1s</button>
            </div>
          </div>

          <div style={{ color: '#999' }}>
            {sizeEstimate != null && sizeEstimate > 0 && <div>Estimated size: {fmtBytes(sizeEstimate)}</div>}
            <div>Clip duration: {formatHMS(Math.max(0, end - start))}</div>
          </div>

          <div>
            <label style={{ marginRight: 8 }}>Quality:</label>
            <select value={height ?? ''} onChange={(e) => setHeight(Number(e.target.value))}>
              {info.qualities.map((h) => (
                <option key={h} value={h}>
                  {h}p
                </option>
              ))}
            </select>
            <button
              style={{ marginLeft: 16, padding: '8px 16px' }}
              onClick={download}
              disabled={end <= start}
            >
              Download clip
            </button>
          </div>
        </div>
      )}

      {progress && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <progress value={progress.pct} max={100} style={{ width: 300 }} />
          <span>{progress.pct.toFixed(1)}%</span>
          {progress.total > 0 && (
            <span style={{ color: '#999' }}>
              · {fmtBytes(Math.min(progress.downloaded, progress.total))} / {fmtBytes(progress.total)}
            </span>
          )}
          {progress.speed > 0 && <span style={{ color: '#999' }}>· {fmtSpeed(progress.speed)}</span>}
        </div>
      )}

      {savedPath && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: '#9f9' }}>Saved to {savedPath}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={() => window.yt.openFolder(savedPath)}>Open folder</button>
            <button onClick={() => window.yt.openVideo(savedPath)}>Open video</button>
          </div>
        </div>
      )}

      {status && <p style={{ marginTop: 12, color: '#f66' }}>{status}</p>}
    </div>
  )
}
