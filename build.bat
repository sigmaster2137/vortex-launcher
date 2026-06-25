@echo off
setlocal enabledelayedexpansion

REM Vortex Launcher Build Script for Windows
REM Just double-click this file to build!

echo.
echo ========================================
echo    VORTEX LAUNCHER BUILD SCRIPT
echo ========================================
echo.

REM Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Node.js version:
for /f "tokens=*" %%i in ('node -v') do echo %%i
echo npm version:
for /f "tokens=*" %%i in ('npm -v') do echo %%i
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo [1/4] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/4] Dependencies already installed
    echo.
)

REM Type check
echo [2/4] Type checking...
call npm run typecheck
if errorlevel 1 (
    echo WARNING: Type check failed, but continuing...
    echo.
)
echo.

REM Build frontend
echo [3/4] Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)
echo.

REM Build Electron app
echo [4/4] Building Electron app...
echo.

REM Get platform argument or use current
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=current"

if "%TARGET%"=="win" goto :build_win
if "%TARGET%"=="mac" goto :build_mac
if "%TARGET%"=="linux" goto :build_linux
if "%TARGET%"=="all" goto :build_all
goto :build_current

:build_win
echo Building for Windows...
call npx electron-builder --win --x64
goto :done

:build_mac
echo Building for macOS...
call npx electron-builder --mac
goto :done

:build_linux
echo Building for Linux...
call npx electron-builder --linux
goto :done

:build_all
echo Building for all platforms...
call npx electron-builder --win --mac --linux
goto :done

:build_current
echo Building for current platform...
call npx electron-builder
goto :done

:done
echo.
echo ========================================
echo    BUILD COMPLETE!
echo ========================================
echo.

REM Show output
if exist "release" (
    echo Output files:
    dir /b release
    echo.
    echo Full path: %CD%\release
) else (
    echo Check the 'release' folder for output
)
echo.
echo You can now run the launcher from the release folder!
echo.
pause
