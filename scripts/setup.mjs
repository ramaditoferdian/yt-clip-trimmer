import { spawnSync } from 'node:child_process'
import { platform } from 'node:os'

const isWin = platform() === 'win32'

function has(cmd) {
  const r = spawnSync(isWin ? 'where' : 'which', [cmd], { shell: true, stdio: 'ignore' })
  return r.status === 0
}

const missing = ['yt-dlp', 'ffmpeg'].filter((c) => !has(c))

if (missing.length > 0) {
  console.log('Missing dependencies: ' + missing.join(', '))
  if (isWin) {
    console.log('Run: winget install -e --id yt-dlp.yt-dlp --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements')
  } else if (platform() === 'darwin') {
    console.log('Run: brew install yt-dlp ffmpeg')
  } else {
    console.log('Run: sudo apt install -y yt-dlp ffmpeg')
  }
  process.exit(1)
}

console.log('yt-dlp & ffmpeg ready. Starting app…')
const run = spawnSync('npm', ['run', 'dev'], { stdio: 'inherit', shell: isWin })
process.exit(run.status ?? 0)
