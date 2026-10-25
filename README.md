# YTM-DeSlop: AI Music Slop Blocker

A comprehensive tool that blocks/heavily reduces AI-generated music "slop" on **music.youtube.com** + **youtube.com**.

Built by aggregating multiple community-maintained AI music blocklists into a unified, deduplicated dataset, then generating:

- **Tampermonkey / Violentmonkey userscript** — `src/userscript.js` + `src/userscript.json`
- **Firefox extension** — `build/firefox/` (Manifest V3)
- **Chrome / Edge extension** — `build/chrome/` (Manifest V3)

---

## 🎯 Objective

AI-generated music flooding YouTube Music and YouTube ("AI slop") is a growing problem. This project:

1. Aggregates AI music blocklists from multiple trusted community sources.
2. Normalizes and deduplicates them into a single canonical dataset.
3. Generates browser-extension artifacts that automatically block detected AI content.
4. Provides a build/release pipeline for automated deployment.

---

## 📚 Blocklist Sources

| Source | Type | Status |
|--------|------|--------|
| [Stevoisiak/Stevos-AI-Blocklist](https://github.com/Stevoisiak/Stevos-AI-Blocklist) | uBlock Origin filter list | ✅ Configured |
| [muhdiyoboy/yAI-TLM-Blocklist](https://gist.githubusercontent.com/muhdiboy/9c26ef76a0ce209f23bcc2fb8c3a6d5b/raw/19e97107a59034eed1dcd847e79cfcedf65fb1c7/ytm_ai_blocklist.txt) | YouTube Music channel URLs | ✅ Configured |
| [Override92/AiSList](https://github.com/Override92/AiSList) | Community blocklist + warnlist (@handle/UC) | ✅ Configured |
| [CevvalYoutubeAIBlocklist](https://github.com/cevvalkoala/CevvalYoutubeAIBlocklist) | uBlock Origin AI-music blocklist | ✅ Configured |
| [firemountainpeak-lang/YTM-AI-Artist-Song-Blocker](https://github.com/firemountainpeak-lang/YTM-AI-Artist-Song-Blocker) | Artist blocking via Soul Over AI | ✅ Configured |

---

## 🏗️ Architecture

```
                    ┌─────────────────────────────────────┐
                    │  blocklist_aggregator.py (Python)    │
                    │  - Fetches all sources              │
                    │  - Normalizes handles/UC IDs       │
                    │  - Deduplicates & merges            │
                    │  → src/data/blocklist.json         │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │       build/build.py          │
                    │  - Packages extensions       │
                    │  - Creates release zips      │
                    └───────────────┬───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
    ┌─────────▼────────┐   ┌───────▼──────────┐   ┌─────▼──────────┐
    │  userscript.zip  │   │ ytm-deslop-firefox │   │ ytm-deslop-chrome│
    │  (Tampermonkey)   │   │ v1.zip            │   │ v1.zip          │
    └──────────────────┘   └────────────────────┘   └────────────────┘
```

---

## 🚀 Quick Start

### 1. Install the Userscript (Tampermonkey / Violentmonkey / Greasemonkey)

1. Open Tampermonkey/Violentmonkey → "Create new script".
2. Replace content with `src/userscript.js`.
3. Import `src/userscript.json` metadata if your manager requires it.
4. Save and enable.

### 2. Install the Firefox Extension

1. Open `about:debugging#/runtime/this-firefox`.
2. Load the temporary extension from `build/firefox/` (contains `manifest.json`).
3. Alternatively, install the released `ytm-deslop-firefox-v1.zip`.

### 3. Install the Chrome / Edge Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** → select `build/chrome/`.
4. Alternatively, install the released `ytm-deslop-chrome-v1.zip`.

---

## 🔧 Build & Release

### Run full build

```bash
python3 build/build.py
```

This will:

1. Fetch all blocklists via `src/blocklist_aggregator.py`.
2. Generate `src/data/blocklist.json`.
3. Package Firefox and Chrome extensions into `output/`.
4. Package the userscript into `output/`.

### Release

```bash
python3 build/build.py --release
```

Or via GitHub Actions:

- The workflow in `.github/workflows/release.yml` packages and publishes artifacts.

---

## 🛠️ Configuration

- **Blocklist JSON**: `src/data/blocklist.json` — generated output consumed by all artifacts.
- **Sources**: configured in `src/blocklist_aggregator.py`.

---

## 📄 License

MIT
