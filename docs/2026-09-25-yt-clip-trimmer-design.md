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
| Preview mechanism | Progressive stream → `<video>` (option A) | Simplest, audio+video up to 720p, native seek. 1080p preview via MSE is a future upgrade. |
| Trim precision | Frame-exact (re-encode) | Cuts land exactly at chosen timestamps; slower encode accepted. |
| Download engine | yt-dlp | Already does format selection + section download (`--download-sections`). |
| Trim engine | ffmpeg (invoked by yt-dlp) | Frame-exact cuts via `--force-keyframes-at-cuts`. |

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
- `<video>` player for preview (stream URL from `getStreamUrl`).
- Start/end range controls (sliders or time inputs), validated against duration.
- Quality dropdown, populated from `getInfo`.
- Download button + progress bar.
- Inline error messages.

**Preload (`src/preload/index.ts`)**

- `getInfo(url)`, `getStreamUrl(url)`, `downloadSection(url, formatId, start, end)`, `onProgress(cb)`.

**Main (`src/main/`)**

- `index.ts` — BrowserWindow setup + IPC wiring.
- `ytdlp.ts` — spawn wrappers:
  - `getInfo(url)` → `yt-dlp -J <url>` → title, duration, `formats` (id + quality label).
  - `getStreamUrl(url)` → `yt-dlp -f "best[acodec!=none][vcodec!=none][ext=mp4]/best[acodec!=none]" -g <url>`.
  - `downloadSection(url, formatId, start, end)` → `yt-dlp -f <formatId> --download-sections "*START-END" --force-keyframes-at-cuts -o <out>`, streaming progress via yt-dlp progress hook.
- `binaries.ts` — resolve bundled yt-dlp/ffmpeg paths (platform-aware).

## Data flow

1. User pastes URL → `getInfo` → show title + quality list.
2. `getStreamUrl` → set `<video src>` → user plays/scrubs the full video.
3. User sets start/end → validated `< duration`, `start < end`.
4. User picks quality → clicks download → `downloadSection`.
5. Progress hook → renderer progress bar.
6. On completion → save dialog (default to `~/Downloads`) → done.

## Preview mechanism (detail)

`yt-dlp -f "best[acodec!=none][vcodec!=none][ext=mp4]/best[acodec!=none]" -g` returns a
combined progressive mp4 URL (up to 720p, audio+video) that `<video>` plays directly.

- **Fallback:** if no progressive format exists, use video-only DASH (no audio) and
  show a note.
- **Expiry:** googlevideo URLs are short-lived; re-fetch the stream URL on play.
- **Upgrade path:** 1080p+audio preview via MediaSource Extensions (video-only DASH +
  audio-only), if 720p preview proves insufficient.

## Download & trim (detail)

`yt-dlp -f <formatId> --download-sections "*START-END" --force-keyframes-at-cuts -o <out>`
downloads only the selected range and re-encodes so cuts are frame-exact.
`--force-keyframes-at-cuts` trades speed for accuracy (the locked decision).

- Start/end are formatted as timestamps (`HH:MM:SS`) into `*start-end`.
- yt-dlp invokes ffmpeg internally; ffmpeg must be resolvable in `PATH` (we pass its
  bundled path explicitly).

## Error handling

- Missing yt-dlp/ffmpeg binaries → clear message + reinstall guidance.
- Invalid / age-restricted / private / geo-blocked URL → parse yt-dlp `stderr`, show a
  friendly message.
- Stream URL expired → re-fetch on play.
- No progressive format → video-only fallback + note.
- Download failure mid-run → surface `stderr` + retry button.

## Testing

One runnable self-check (no framework):

- Timestamp parsing: `start/end` → yt-dlp `*start-end` string.
- Format selection: picking the best progressive format id from `formats`.

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
- 1080p preview with audio (MSE) — future upgrade.
- Fast (keyframe-snap) trim toggle — future option.
- Auto-update, analytics, telemetry.
