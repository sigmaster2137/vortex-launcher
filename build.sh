#!/bin/bash

# Vortex Launcher Build Script
# Just run this to build the launcher!

set -e

echo "========================================"
echo "   VORTEX LAUNCHER BUILD SCRIPT"
echo "========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"
echo ""

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo ">>> Installing dependencies..."
    npm install
    echo ""
fi

# Type check
echo ">>> Type checking..."
npm run typecheck || echo "WARNING: Type check failed, but continuing..."
echo ""

# Build frontend
echo ">>> Building frontend..."
npm run build
echo ""

# Build Electron app
echo ">>> Building Electron app..."
PLATFORM=${1:-current}

case $PLATFORM in
    win|windows)
        echo "Building for Windows..."
        npx electron-builder --win --x64
        ;;
    mac|macos|darwin)
        echo "Building for macOS..."
        npx electron-builder --mac
        ;;
    linux)
        echo "Building for Linux..."
        npx electron-builder --linux
        ;;
    all)
        echo "Building for all platforms..."
        npx electron-builder --win --mac --linux
        ;;
    *)
        echo "Building for current platform..."
        npx electron-builder
        ;;
esac

echo ""
echo "========================================"
echo "   BUILD COMPLETE!"
echo "========================================"
echo ""
echo "Output files are in the 'release' folder:"
ls -la release/ 2>/dev/null || echo "(release folder will appear after first build)"
echo ""
