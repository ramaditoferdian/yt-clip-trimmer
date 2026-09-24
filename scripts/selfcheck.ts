import { strict as assert } from 'node:assert'
import {
  parseFfmpegProgress,
  parseFfmpegTotalSize,
  extractHeights,
  buildFormatExpr,
  parseHlsSegments,
  estimateSectionBytes
} from '../src/main/lib'
import { formatHMS, parseHMS, sanitizeFilename, buildClipFilename, estimateBytes } from '../src/shared/format'

assert.strictEqual(parseFfmpegProgress('out_time_us=1500000'), 1.5)
assert.strictEqual(parseFfmpegProgress('out_time_ms=2000000'), 2)
assert.strictEqual(parseFfmpegProgress('frame=42'), null)
assert.strictEqual(parseFfmpegTotalSize('total_size=123456'), 123456)
assert.strictEqual(parseFfmpegTotalSize('foo=1'), null)

assert.strictEqual(formatHMS(0), '00:00:00')
assert.strictEqual(formatHMS(83), '00:01:23')
assert.strictEqual(formatHMS(3723), '01:02:03')
assert.strictEqual(parseHMS('02:07:54'), 7674)
assert.strictEqual(parseHMS('07:54'), 474)
assert.strictEqual(parseHMS('54'), 54)
assert.strictEqual(parseHMS('abc'), null)
assert.strictEqual(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij')
assert.strictEqual(buildClipFilename('My Video', 83, 95), 'My Video - [00-01-23 - 00-01-35].mp4')
assert.strictEqual(estimateBytes(8000, 10), 10_000_000)

const videoSegs = parseHlsSegments(
  [
    '#EXTM3U',
    '#EXTINF:5.0,',
    'https://x/slices%3D0-87365/gosq/0/file/seg.ts',
    '#EXTINF:5.0,',
    'https://x/slices%3D0-738,87366-115784/gosq/1/file/seg.ts'
  ].join('\n')
)
assert.strictEqual(videoSegs.length, 2)
assert.strictEqual(videoSegs[0].size, 87366)
assert.strictEqual(videoSegs[1].size, 28419)

const audioSegs = parseHlsSegments(
  [
    '#EXTM3U',
    '#EXTINF:5.0,',
    'https://x/slices%3D0-179039/gosq/0/file/seg.ts',
    '#EXTINF:5.0,',
    'https://x/slices%3D0-340444/gosq/1/file/seg.ts',
    '#EXTINF:5.0,',
    'https://x/slices%3D0-631,179040-340444/gosq/2/file/seg.ts'
  ].join('\n')
)
assert.strictEqual(audioSegs.length, 3)
assert.strictEqual(audioSegs[0].size, 179040)
assert.strictEqual(audioSegs[1].size, 161405)
assert.strictEqual(audioSegs[2].size, 0)
assert.strictEqual(audioSegs.reduce((a, s) => a + s.size, 0), 340445)

const simple = [
  { start: 0, end: 5, size: 1000 },
  { start: 5, end: 10, size: 1000 }
]
assert.strictEqual(estimateSectionBytes(simple, 2.5, 7.5), 1000)

assert.deepStrictEqual(
  extractHeights([{ height: 720 }, { height: 1080 }, { height: 1080 }, { height: null }]),
  [1080, 720]
)
assert.strictEqual(
  buildFormatExpr(1080),
  'bv*[height<=1080][vcodec^=avc1][protocol=m3u8_native]+ba[protocol=m3u8_native]/b[height<=1080]'
)

console.log('selfcheck passed')
