# Vortex Launcher

A modern, high-performance Minecraft launcher built with Electron and React.

## Development

```bash
# Install dependencies
npm install

# Start in development mode (Vite + Electron)
npm run electron:dev

# Build and preview with Electron
npm run electron:preview
```

## Production Build

```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:win    # Windows (NSIS + Portable)
npm run dist:mac    # macOS (DMG + ZIP)
npm run dist:linux  # Linux (AppImage + DEB + RPM)
```

## Icons & Assets

Place the following files in `electron/build/`:

- `icon.ico` (256x256) - Windows icon
- `icon.icns` - macOS icon (use `icon-gen` or https://cloudconvert.com/png-to-icns)
- `icons/` - Linux icon set (512x512.png, 256x256.png, etc.)
- `sidebar.bmp` (optional) - Windows installer sidebar (164x314 BMP)

## Architecture

```
electron/
  main.js      - Main Electron process
  preload.js   - ContextBridge IPC bridge
  build/       - Build assets (icons, etc.)

src/
  App.tsx      - React entry point
  components/  - UI components
  hooks/       - React hooks + Electron integration
  types/       - TypeScript type definitions
```

## Electron IPC API

The React app communicates with Electron via these IPC channels:

### Window Controls
- `minimizeWindow()`
- `maximizeWindow()`
- `closeWindow()`

### File System
- `openFolder(path?)` - Open folder in file manager
- `selectFolder()` - Show folder picker dialog
- `selectFile(filters?)` - Show file picker dialog

### Minecraft
- `getMinecraftPath()` - Get `.minecraft` path
- `listInstances()` - List installed versions
- `findJava()` - Auto-detect Java installations
- `launchMinecraft(options)` - Launch a Minecraft instance
- `killMinecraft()` - Terminate running process

### Events
- `onMinecraftLog(callback)`
- `onMinecraftClosed(callback)`
- `onMinecraftError(callback)`

## Real Launch Implementation

The `launchMinecraft` function in `main.js` is a simplified skeleton. To make it fully functional, you need to:

1. **Parse version JSON** - Read instance version JSON to get:
   - Main class name
   - Classpath libraries
   - Game arguments
   - JVM arguments

2. **Construct command line**:
   ```js
   java -Xmx4G -cp libraries/*:minecraft.jar net.minecraft.client.main.Main
   --username Steve --uuid xxx --accessToken xxx --gameDir .minecraft
   ```

3. **Handle authentication**:
   - Microsoft OAuth2 flow for online mode
   - Offline mode username for cracked/lan

For a complete reference, see:
- [Prism Launcher](https://github.com/PrismLauncher/PrismLauncher)
- [HMCL](https://github.com/HMCL-dev/HMCL)
- [Mojang Auth API](https://wiki.vg/Microsoft_Authentication_Scheme)
