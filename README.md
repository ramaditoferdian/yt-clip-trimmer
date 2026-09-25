# YT Clip Trimmer

Aplikasi desktop (Electron) untuk memotong & mengunduh potongan video YouTube menjadi
file `.mp4` — preview dulu, pilih start/end, lalu download hanya bagian itu.

## Quick start (1 command)

Buka terminal di folder project, lalu jalankan sesuai OS:

**Windows (PowerShell):**
```powershell
winget install -e --id yt-dlp.yt-dlp --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements; npm install; npm run dev
```

**macOS:**
```bash
brew install yt-dlp ffmpeg && npm install && npm run dev
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install -y yt-dlp ffmpeg && npm install && npm run dev
```

**Sekalian clone dari fresh (ganti `<REPO_URL>`):**
```powershell
# Windows
git clone <REPO_URL> yt-clip-trimmer; cd yt-clip-trimmer; winget install -e --id yt-dlp.yt-dlp --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements; npm install; npm run dev
```
```bash
# macOS / Linux
git clone <REPO_URL> yt-clip-trimmer && cd yt-clip-trimmer && brew install yt-dlp ffmpeg && npm install && npm run dev
```

> Alternatif: `npm run setup` — cek `yt-dlp` & `ffmpeg` (kasih tahu command install kalau
> belum ada), lalu langsung jalankan app-nya.

## Prasyarat

- **Node.js** 18+
- **yt-dlp** — ambil info video & stream
- **ffmpeg** — potong/mux hasil

## Cara pakai

1. **Paste URL** YouTube di kolom atas → klik **Load**.
2. **Preview** video di player (play/seek seperti biasa).
3. **Tentukan range:**
   - putar video ke posisi yang diinginkan, lalu klik **Set start** / **Set end** (current time), atau
   - ketik langsung di field `HH:MM:SS`, atau
   - geser pakai tombol **nudge `±1s`**.
4. **Pilih quality** (dropdown).
5. Klik **Download clip** → pilih lokasi simpan.
6. Setelah selesai → **Open folder** / **Open video**.

## Catatan

- Preview memakai embed YouTube. Video yang **tidak mengizinkan embed** atau
  **age-restricted** tidak bisa dipreview.
- Potongan **frame-accurate** (stream copy via HLS).
- `yt-dlp` & `ffmpeg` dicari lewat urutan ini: env `YTDLP_PATH`/`FFMPEG_PATH` →
  folder `bin/` → `PATH`. Kalau tidak terpasang global, taruh binari di `bin/`.

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run setup` | cek yt-dlp/ffmpeg lalu jalankan app |
| `npm run dev` | jalankan app (development) |
| `npm run build` | build produksi |
| `npm run typecheck` | cek tipe TypeScript |
| `npm run selfcheck` | tes logika inti |
