# Home Assistant Companion Desktop

A native desktop companion app for [Home Assistant](https://www.home-assistant.io/), built with [Tauri 2.0](https://v2.tauri.app/).

> **Warning**
> This project is under active development and is **not ready for testing or production use**. APIs, features, and functionality may change without notice. Use at your own risk.

## Features

- **Multi-Server Support** - Connect to multiple Home Assistant instances and switch between them
- **System Tray Integration** - Quick access from your system tray with server switching
- **mDNS Discovery** - Automatically discover Home Assistant servers on your local network
- **Device Registration** - Register as a companion device with Home Assistant
- **Desktop Notifications** - Receive notifications from Home Assistant on your desktop
- **Sensor Reporting** - Report system sensors to Home Assistant:
  - Battery status and charging state
  - CPU usage
  - Memory usage
  - Disk usage
  - WiFi network information
  - System uptime
- **Encrypted Storage** - Secure credential storage using system keyring
- **Auto-Start** - Launch automatically when your system starts
- **Theme Support** - Follows your system's light/dark theme preference

## Tech Stack

- **Frontend**: TypeScript, [Lit](https://lit.dev/), [Home Assistant WebAwesome](https://github.com/home-assistant/webawesome)
- **Backend**: Rust with Tauri 2.0
- **Build**: Vite, Bun

## Development

### Prerequisites

#### All Platforms
- [Bun](https://bun.sh/) (JavaScript runtime and package manager)
- [Rust](https://rustup.rs/) (1.70 or later)

#### Linux

Install the required system dependencies:

**Debian/Ubuntu:**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libxdo-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  gtk3-devel \
  libsoup3-devel \
  javascriptcoregtk4.1-devel
```

**Arch Linux:**
```bash
sudo pacman -S webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  libxdo \
  libappindicator-gtk3 \
  librsvg \
  gtk3 \
  libsoup3
```

#### Windows

1. Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Select "Desktop development with C++" workload
2. Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10/11)

#### macOS

1. Install Xcode Command Line Tools:
```bash
xcode-select --install
```

### Setup

1. Clone the repository:
```bash
git clone https://github.com/home-assistant/desktop.git
cd desktop
```

2. Install dependencies:
```bash
bun install
```

3. Run in development mode:
```bash
bun tauri dev
```

### Building

Build a release version:
```bash
bun tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server (frontend only) |
| `bun tauri dev` | Start full Tauri development environment |
| `bun tauri build` | Build release version |
| `bun run lint` | Lint source code with Biome |
| `bun run format` | Format source code with Biome |
| `bun run check` | Check and fix source code with Biome |

## Project Structure

```
desktop/
├── src/                    # Frontend TypeScript/Lit code
│   ├── components/         # Lit web components
│   ├── views/              # Application views
│   ├── services/           # Frontend services
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Rust backend code
│   ├── src/
│   │   ├── api/            # Home Assistant API integration
│   │   ├── commands/       # Tauri commands (IPC)
│   │   ├── device/         # Device information
│   │   ├── notifications/  # Desktop notifications & WebSocket
│   │   ├── sensors/        # System sensor collection
│   │   └── storage/        # Encrypted config storage
│   └── icons/              # Application icons
└── dist/                   # Built frontend (generated)
```

## Known Limitations

### Linux / Wayland
- System tray functionality may be limited on some Wayland compositors
- Some features require XDG portal support

## Contributing

Contributions are welcome! Please note that this project is in early development, so please open an issue to discuss major changes before submitting a pull request.

## License

This project is part of the Home Assistant ecosystem. See [LICENSE](LICENSE) for details.
