export function formatHMS(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function parseHMS(value: string): number | null {
  const parts = value.trim().split(':').map((p) => Number(p))
  if (parts.length === 0 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return null
  }
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'clip'
}

export function buildClipFilename(title: string, startSec: number, endSec: number): string {
  const s = formatHMS(startSec).replace(/:/g, '-')
  const e = formatHMS(endSec).replace(/:/g, '-')
  return `${sanitizeFilename(title)} - [${s} - ${e}].mp4`
}

export function estimateBytes(kbps: number, durationSec: number): number {
  return (kbps * 1000 / 8) * durationSec
}
