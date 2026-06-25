# Vortex Launcher

A modern, fast Minecraft launcher built with Electron and React.

> **⚠️ Pre-Release Notice:** This is an early pre-release version. Features may change and bugs may be present.

> **🔓 Cracked Launcher:** This launcher supports offline accounts without requiring Microsoft authentication, allowing you to play Minecraft without purchasing the game.

## Quick Start

### Option 1: Build from Source

```bash
# Extract the project
cd vortex-launcher

# Run the build script
./build.sh          # Linux/macOS
build.bat           # Windows

# Or use npm directly:
npm install
npm run dist        # Builds for your platform
```

### Option 2: Development Mode

```bash
npm install
npm run electron:dev
```

## One-Click Build

Just run `build.sh` (Linux/macOS) or `build.bat` (Windows) and it will:
1. Install dependencies automatically
2. Build the frontend
3. Package into an executable app

Output goes to the `release/` folder.

## Build Targets

```bash
./build.sh           # Current platform
./build.sh win       # Windows only
./build.sh mac       # macOS only
./build.sh linux     # Linux only
./build.sh all       # All platforms
```

## Features

- **Fast Launch** - No fake delays, instant feedback
- **Offline Accounts** - Play without Microsoft account (cracked mode)
- **Instance Management** - Create, delete, customize
- **Java Detection** - Auto-find installed Java
- **Mod Installation** - Browse and install mods from Modrinth
- **Content Management** - View installed mods, shaders, resource packs
- **Cross-Platform** - Windows, macOS, Linux

## Project Structure

```
vortex-launcher/
├── electron/
│   ├── main.js        # Electron main process
│   ├── preload.js     # ContextBridge IPC
│   └── build/         # Build assets (icons)
├── src/
│   ├── App.tsx        # React entry
│   ├── components/    # UI components
│   ├── hooks/         # React hooks
│   └── types/         # TypeScript types
├── build.sh           # Build script (Unix)
├── build.bat          # Build script (Windows)
└── package.json
```

## Icons (Optional)

For custom icons, place these in `electron/build/`:
- `icon.ico` (256x256) - Windows
- `icon.icns` - macOS
- `icons/` (512x512.png) - Linux

Without icons, Electron uses a default icon.

## Requirements

- Node.js 18+
- npm 9+

## License

This project is licensed under a custom license. See the [LICENSE](LICENSE) file for details.

**Important restrictions:**
- You may NOT sell this launcher or use it for commercial purposes
- You may NOT claim this launcher as your own work
- You must credit the Vortex Team as the original authors
- You may NOT remove or alter copyright notices

## Pre-Release Status

This is version 0.1.0-pre. The launcher is functional but may contain bugs. Future updates will include:
- Microsoft account authentication re-enablement
- Performance improvements
- Additional features and UI refinements
- Bug fixes based on user feedback
