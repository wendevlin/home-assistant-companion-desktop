# Home Assistant Desktop

A fast, lightweight, cross-platform desktop application for Home Assistant built with [Electrobun](https://electrobun.dev).

## Features

- **🚀 Lightning Fast**: Built with Electrobun using Bun runtime and native system webviews
- **💾 Persistent Storage**: Your Home Assistant server URL is saved locally with persistent webview storage
- **🎨 Clean UI**: Simple settings page for initial configuration
- **🔒 Secure**: Uses system's native webview (WebKit on macOS, Edge WebView2 on Windows, WebKitGTK on Linux)
- **🌊 Wayland Support**: Works natively on modern Linux desktops (GNOME, KDE, etc.)
- **🌐 Cross-Platform**: Works on macOS, Windows, and Linux
- **📦 Tiny Bundle**: ~12MB app size using system webview

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed on your system

**Linux (Arch/Manjaro) additional dependencies:**
```bash
sudo pacman -S --needed base-devel cmake gtk3 webkit2gtk-4.1
```

**Linux (Ubuntu/Debian) additional dependencies:**
```bash
sudo apt install build-essential cmake pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
```

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd desktop
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

### Development

Run the app in development mode:
```bash
bun run dev
```

### Building

Build the app for production:
```bash
bun run build
```

## Usage

1. **First Launch**: Enter your Home Assistant server URL (e.g., `http://localhost:8123` or `https://homeassistant.local:8123`)
2. **Main View**: The app displays your Home Assistant interface in a webview
3. **Settings**: Your server URL is automatically saved and will be remembered on next launch
4. **Close Window**: Close the window to quit the application

## Storage & Security

### App Settings Storage

The Home Assistant server URL is stored using `localStorage` in the webview, which is:
- **Persistent**: Survives app restarts
- **Isolated**: Separate from your browser's storage
- **Secure**: Uses the partition `persist:homeassistant` for data isolation

### Webview Storage

The Electrobun webview uses persistent partitions to maintain your Home Assistant session:
- Cookies and session data are preserved between app restarts
- Full isolation from other applications
- Native security provided by the system's webview

## Project Structure

```
desktop/
├── src/
│   ├── bun/           # Main process (Bun runtime)
│   │   └── index.ts   # App initialization, window & tray management
│   └── mainview/      # UI (runs in webview)
│       ├── index.html # Settings page & webview container
│       ├── index.css  # Styling
│       └── index.ts   # UI logic
├── electrobun.config.ts  # Electrobun configuration
├── biome.json            # Biome linter & formatter config
└── package.json          # Project dependencies & scripts
```

## Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run format` - Format code with Biome
- `bun run lint` - Lint code with Biome
- `bun run lint:fix` - Auto-fix linting issues
- `bun run check` - Format and lint code

## Tech Stack

- **[Electrobun](https://electrobun.dev)**: Desktop app framework
- **[Bun](https://bun.sh)**: JavaScript runtime
- **[TypeScript](https://www.typescriptlang.org/)**: Type-safe JavaScript
- **[Biome](https://biomejs.dev/)**: Fast linter and formatter

## Why Electrobun?

Electrobun offers several advantages over Electron:
- **Smaller Bundle Size**: ~12MB vs Electron's ~100MB+
- **Faster Startup**: Uses Bun runtime instead of Node.js
- **Native Performance**: System webview instead of bundled Chromium
- **Simple Architecture**: Clean separation between main process and UI
- **Modern Stack**: Built for TypeScript from the ground up

## Known Limitations

### Linux-Specific
- **System Tray**: System tray functionality is not currently available on Linux (Electrobun limitation)
- **Window Management**: Window minimize/hide/show APIs are not yet implemented in Electrobun v0.1.12
- **Application Menu**: Application menus are not supported on Linux - UI-based menus should be implemented in the webview instead

### Wayland
- **X11 Warnings**: You may see `X11 Error: GLXBadWindow` warnings in the console - these are harmless and don't affect functionality
- The app works correctly on Wayland despite these warnings

**Note**: Electrobun is in early development (v0.1.12). Many features are still being implemented. Check the [Electrobun roadmap](https://github.com/blackboardsh/electrobun/issues/2) for upcoming features.

## License

MIT
