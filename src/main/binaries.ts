import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

function binDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'bin')
}

function resolve(name: string, envVar: string): string | null {
  const env = process.env[envVar]
  if (env) return env
  const bundled = join(binDir(), process.platform === 'win32' ? `${name}.exe` : name)
  return existsSync(bundled) ? bundled : null
}

export function ytdlpPath(): string {
  return resolve('yt-dlp', 'YTDLP_PATH') ?? 'yt-dlp'
}

export function ffmpegPath(): string | null {
  return resolve('ffmpeg', 'FFMPEG_PATH')
}
