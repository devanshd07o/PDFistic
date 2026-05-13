# PDFistic

AI-powered PDF reader for Windows built with Electron + React.

PDFistic combines modern PDF reading with integrated AI assistance, full-text search, annotations, voice input, and multi-provider AI support in a clean desktop experience.

---

### ⭐ If you find PDFistic useful, consider starring the repository.

## Features

- AI chat with 5 providers
- Full PDF text search
- Highlight & annotation support
- Resume from last reading position
- Recent files history
- Sidebar thumbnails & table of contents
- Voice input support
- Fit-width responsive rendering
- Local encrypted storage
- Frameless custom desktop UI
- PDF file association support

---

## AI Providers

PDFistic supports multiple AI providers:

| Provider | Model |
|---|---|
| Gemini | gemini-3.1-flash-lite |
| Groq | llama-3.3-70b-versatile |
| OpenRouter | inclusionai/ring-2.6-1t:free |
| Cerebras | llama-3.3-70b |
| Mistral | mistralai/mistral-small |

---

## Tech Stack

| Technology | Usage |
|---|---|
| Electron | Desktop app framework |
| React 19 | Frontend UI |
| Vite | Build tooling |
| PDF.js | PDF rendering |
| electron-store | Local persistent storage |
| Electron Builder | Packaging & installer generation |

---

## Installation

### Download Latest Release

Download from:

```bash
https://github.com/devanshd07o/pdfistic/releases/latest
```

### Windows Installation

1. Download `PDFistic.Setup.1.0.11.exe`
2. Run the installer
3. If Windows SmartScreen appears:
   - Click `More info`
   - Click `Run anyway`
4. Launch PDFistic from desktop shortcut

---

## Voice Feature (Optional)

Voice input requires Python installed on the system.

### Install Python packages

```bash
pip install SpeechRecognition PyAudio
```

---

## Development Setup

### Clone Repository

```bash
git clone https://github.com/devanshd07o/pdfistic.git
cd pdfistic
```

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

### Build Installer

```bash
npm run build
```

Generated installer:

```bash
dist-electron/PDFistic.Setup.1.0.11.exe
```

---

## Architecture Overview

### Electron Main Process
Handles:
- IPC communication
- File access
- Desktop integration
- Speech recognition subprocess
- Window controls

### React Renderer
Handles:
- PDF rendering
- Search & highlights
- AI chat UI
- Sidebar navigation
- Theme management

### AI Layer
- Raw fetch API integration
- Streaming responses via SSE
- Multi-provider support
- Local API key storage

---

## Current Status

Stable Windows release available.

### Planned Features

- Auto-update support
- PDF thumbnail previews
- Mac/Linux testing
- OCR improvements
- Better voice integration

---

## Screenshots

_Add screenshots here later_

Example:

```markdown
![Home](screenshots/home.png)
![Viewer](screenshots/viewer.png)
![AI Panel](screenshots/ai.png)
```

---

## Security & Privacy

- API keys stored locally
- No external tracking
- No cloud database
- Files processed locally

---

## License

Copyright © 2026 Devansh Dubey  
All Rights Reserved.

Unauthorized copying, modification, distribution, or commercial use of this software is prohibited.

---

## Author

Crafted by Devansh Dubey

---
