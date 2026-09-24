export function parseFfmpegProgress(line: string): number | null {
  const m = line.match(/^out_time_(?:us|ms)=(\d+)/)
  return m ? Number(m[1]) / 1_000_000 : null
}

export function parseFfmpegTotalSize(line: string): number | null {
  const m = line.match(/^total_size=(\d+)/)
  return m ? Number(m[1]) : null
}

export function extractHeights(formats: { height?: number | null }[]): number[] {
  const heights = new Set<number>()
  for (const f of formats) {
    if (typeof f.height === 'number' && f.height > 0) heights.add(f.height)
  }
  return [...heights].sort((a, b) => b - a)
}

export function buildFormatExpr(height: number): string {
  return `bv*[height<=${height}][vcodec^=avc1][protocol=m3u8_native]+ba[protocol=m3u8_native]/b[height<=${height}]`
}

export interface HlsSegment {
  start: number
  end: number
  size: number
}

function parseSlicesRanges(url: string): [number, number][] {
  const m = url.match(/slices(?:%3D|=)([^&/]+)/i)
  if (!m) return []
  return decodeURIComponent(m[1]).split(',').map((r) => {
    const [a, b] = r.split('-').map(Number)
    return [a, b || a] as [number, number]
  })
}

export function parseHlsSegments(manifest: string): HlsSegment[] {
  const segments: HlsSegment[] = []
  let time = 0
  let pendingDur: number | null = null
  let maxSeen = 0 // bytes [0, maxSeen) already counted (dedups init repetition + overlapping ranges)
  for (const line of manifest.split('\n')) {
    const t = line.trim()
    if (t.startsWith('#EXTINF:')) {
      pendingDur = parseFloat(t.slice('#EXTINF:'.length).split(',')[0])
    } else if (t.startsWith('#') || t === '') {
      // skip directives and blank lines
    } else if (pendingDur !== null) {
      const start = time
      time += pendingDur
      let size = 0
      for (const [from, to] of parseSlicesRanges(line)) {
        if (to < maxSeen) continue
        const s = Math.max(from, maxSeen)
        size += to - s + 1
        maxSeen = to + 1
      }
      segments.push({ start, end: time, size })
      pendingDur = null
    }
  }
  return segments
}

export function estimateSectionBytes(segments: HlsSegment[], startSec: number, endSec: number): number {
  let total = 0
  for (const seg of segments) {
    if (seg.end <= startSec || seg.start >= endSec) continue
    const overlapStart = Math.max(seg.start, startSec)
    const overlapEnd = Math.min(seg.end, endSec)
    total += seg.size * ((overlapEnd - overlapStart) / (seg.end - seg.start))
  }
  return total
}
