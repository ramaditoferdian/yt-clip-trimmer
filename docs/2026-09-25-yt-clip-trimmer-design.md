# YouTube Clip Trimmer — Design Spec

- **Date:** 2026-09-25
- **Status:** Approved (awaiting user review of this spec)
- **Stack:** Electron + electron-vite + React + TypeScript

## Overview

A desktop app (Electron, Windows/macOS/Linux) that trims a YouTube video into a clip.
The user pastes a YouTube URL, previews the full video in-app, selects a start and
end time, picks an available quality, and downloads only that section as a
frame-exact `.mp4`. No backend service; all work happens locally on the machine.

**Success criteria**

1. Paste a URL and preview the full video (with audio) before downloading anything.
2. Select an arbitrary start/end range and download only that range.
3. Cuts are frame-exact (accurate to the timestamps the user picked).
4. The user can choose from the video's available qualities for the download.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | Desktop app, not Chrome extension | Native ffmpeg + bundled yt-dlp; avoids ffmpeg.wasm size/speed and MV3 service-worker limits. |
| Framework | Electron (JS/TS) | Matches existing workspace skills; trivial `child_process.spawn`. |
| Preview mechanism | YouTube iframe embed + Player API | Audio+video, full seek, zero download before preview. Official player; preview quality handled by YouTube. |
| Trim precision | Frame-exact (re-encode) | Cuts land exactly at chosen timestamps; slower encode accepted. |
| Download engine | yt-dlp (HLS URLs) + ffmpeg | yt-dlp resolves HLS video+audio m3u8; ffmpeg downloads only the section's segments. |
| Trim engine | ffmpeg (direct) | Frame-exact cut via `-ss`/`-t` re-encode on the HLS stream. |

## Architecture

Three processes, two external binaries:

```
Renderer (React)  <--IPC/contextBridge-->  Main (Node)  --spawn-->  yt-dlp / ffmpeg
```

- **Renderer** — the UI only. No Node access (`contextIsolation: true`).
- **Preload** — `contextBridge` exposing a narrow, whitelisted API.
- **Main** — owns all `child_process.spawn` calls to yt-dlp/ffmpeg and the IPC handlers.
- **Binaries** — yt-dlp and ffmpeg are bundled in `extraResources` and resolved at
  runtime by `binaries.ts` (no system-install assumption).

### Components

**Renderer (`src/renderer/App.tsx`)**

- URL input.
- YouTube iframe embed (`YT.Player` from `https://www.youtube.com/embed/<id>`).
- Start/end range controls (sliders or time inputs), validated against duration.
- Quality dropdown, populated from `getInfo`.
- Download button + progress bar.
- Inline error messages.

**Preload (`src/preload/index.ts`)**

- `getInfo(url)`, `download(url, height, startSec, endSec)`, `onProgress(cb)`.

**Main (`src/main/`)**

- `index.ts` — BrowserWindow setup + IPC wiring.
- `ytdlp.ts` — spawn wrappers:
  - `getInfo(url)` → `yt-dlp -J <url>` → id, title, duration, `qualities` (heights).
  - `downloadSection(url, height, start, end)` → resolve HLS video+audio URLs via `yt-dlp -g`, then `ffmpeg -ss/-t` re-encode (progress via `-progress`).
- `binaries.ts` — resolve bundled yt-dlp/ffmpeg paths (platform-aware).

## Data flow

1. User pastes URL → `getInfo` → show title + quality list.
2. `getInfo` returns video `id` → renderer embeds `https://www.youtube.com/embed/<id>` (Player API) → user plays/scrubs the full video.
3. User sets start/end → validated `< duration`, `start < end`.
4. User picks quality → clicks download → `downloadSection`.
5. Progress hook → renderer progress bar.
6. On completion → save dialog (default to `~/Downloads`) → done.

## Preview mechanism (detail)

Preview uses the official YouTube iframe embed with the Player API (`enablejsapi=1`),
not a raw stream. `getInfo` returns the video `id` (yt-dlp parses the pasted URL), and
the renderer creates `YT.Player` from `https://www.youtube.com/embed/<id>`. This gives
audio + video, full seeking, and zero download before preview.

- **Start/end capture:** `player.getCurrentTime()` on button click; sliders call
  `player.seekTo()`.
- **Caveat:** videos that disallow embedding, or age-restricted videos, may not render
  in the iframe — surface an error if the player never becomes ready.

## Download & trim (detail)

Section-only download (no full download). yt-dlp resolves the HLS video + audio
playlists, then ffmpeg seeks into those playlists — downloading only the segments that
cover the selected range — and re-encodes frame-exactly.

1. `yt-dlp -f "bv*[height<=N][vcodec^=avc1][protocol=m3u8_native]+ba[protocol=m3u8_native]/b[height<=N]" -g <url>` → video + audio m3u8 URLs.
2. `ffmpeg -ss START -i <video> -ss START -i <audio> -t DUR -c:v libx264 -c:a aac -movflags +faststart <out>`.

- HLS is segment-based, so ffmpeg `-ss` skips straight to the relevant segments (DASH
  mp4 seeking hangs — that's why we force HLS).
- avc1 + re-encode keeps the container mp4 and makes cuts frame-exact.
- Cap: HLS tops out at 1080p (no 1440p/4K via HLS).

## Error handling

- Missing yt-dlp/ffmpeg binaries → clear message + reinstall guidance.
- Invalid / age-restricted / private / geo-blocked URL → parse yt-dlp `stderr`, show a
  friendly message.
- Preview embed fails to load (video disallows embedding / age-restricted) → show a message.
- Download failure mid-run → surface `stderr` + retry button.

## Testing

One runnable self-check (no framework):

- ffmpeg progress parsing: `parseFfmpegProgress` (`out_time_us`/`out_time_ms` → seconds).
- Format selection: `buildFormatExpr(height)` + `extractHeights` for the download step.

Manual integration check: run `getInfo` + `downloadSection` against a public YouTube
URL (`--simulate`) and verify the trim lands at the chosen timestamps.

## Security

- `contextIsolation: true`, `nodeIntegration: false`.
- IPC via `contextBridge` with a whitelisted channel set.
- `shell.openExternal` for external links; block navigation/window.open.

## File layout

```
yt-clip-trimmer/
  docs/
    2026-09-25-yt-clip-trimmer-design.md
  src/
    main/
      index.ts
      ytdlp.ts
      binaries.ts
    preload/
      index.ts
    renderer/
      App.tsx
  package.json
  electron.vite.config.ts
```

## Out of scope (YAGNI)

- Playlists, subtitles, metadata management.
- Non-embeddable preview fallback (download-to-temp).
- Fast (keyframe-snap) trim toggle — future option.
- Auto-update, analytics, telemetry.
