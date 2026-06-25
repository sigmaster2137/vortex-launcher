import { useState, useEffect, useCallback, useRef } from 'react';
import type { MinecraftInstance, LauncherSettings, ViewType } from '../types/launcher';

// Helper to check if running in Electron
export function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.electron !== 'undefined';
}

interface LaunchPhase {
  phase: 'idle' | 'launching' | 'playing' | 'error' | 'downloading';
  progress: number;
  message: string;
}

export function useElectronLauncher() {
  const [javaRuntimes, setJavaRuntimes] = useState<Array<{ path: string; name: string; version: string }>>([]);
  const [systemInfo, setSystemInfo] = useState<{
    totalMemory: number;
    freeMemory: number;
    cpuCores: number;
    platform: string;
    arch: string;
  } | null>(null);
  const [launchState, setLaunchState] = useState<LaunchPhase>({ phase: 'idle', progress: 0, message: '' });
  const isRunningRef = useRef(false);

  // Initialize Electron-specific data
  useEffect(() => {
    if (!isElectron()) return;

    const electron = window.electron!;

    // Get system info
    electron.getSystemInfo()
      .then(setSystemInfo)
      .catch(e => console.error('Failed to get system info:', e));

    // Find Java installations
    electron.findJava()
      .then(setJavaRuntimes)
      .catch(e => console.error('Failed to find Java:', e));

    // Set up event listeners with cleanup
    const cleanupLog = electron.onMinecraftLog?.((log: string) => {
      console.log('[Minecraft]', log);
    });

    const cleanupClosed = electron.onMinecraftClosed?.(() => {
      setLaunchState({ phase: 'idle', progress: 0, message: '' });
      isRunningRef.current = false;
    });

    const cleanupError = electron.onMinecraftError?.((error: string) => {
      setLaunchState({ phase: 'error', progress: 0, message: error });
      isRunningRef.current = false;
    });

    const cleanupDownload = electron.onDownloadProgress?.((progress: { phase: string; progress: number }) => {
      console.log('[Download]', progress.phase, progress.progress + '%');
      setLaunchState({ phase: 'downloading', progress: progress.progress, message: progress.phase });
    });

    return () => {
      cleanupLog?.();
      cleanupClosed?.();
      cleanupError?.();
      cleanupDownload?.();
    };
  }, []);

  const launch = useCallback(async (instance: MinecraftInstance, settings: LauncherSettings, username?: string) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    // In browser mode (no Electron), just simulate success instantly
    if (!isElectron()) {
      setLaunchState({ phase: 'launching', progress: 50, message: 'Starting...' });
      await new Promise(r => setTimeout(r, 100));
      setLaunchState({ phase: 'playing', progress: 100, message: 'Game launched!' });
      return;
    }

    const javaPath = settings.javaPath || javaRuntimes[0]?.path;
    if (!javaPath) {
      setLaunchState({ phase: 'error', progress: 0, message: 'No Java installation found. Download Java in Settings.' });
      isRunningRef.current = false;
      return;
    }

    setLaunchState({ phase: 'launching', progress: 10, message: 'Validating instance...' });

    try {
      const result = await window.electron!.launchMinecraft({
        javaPath,
        javaArgs: settings.javaArgs,
        instancePath: instance.id,
        width: settings.width,
        height: settings.height,
        fullscreen: settings.fullscreen,
        memory: settings.memory,
        username: username || 'Player',
      });

      if (result.success) {
        setLaunchState({ phase: 'playing', progress: 100, message: 'Game launched!' });
      } else {
        setLaunchState({ phase: 'error', progress: 0, message: result.error || 'Launch failed' });
        isRunningRef.current = false;
      }
    } catch (e) {
      setLaunchState({ phase: 'error', progress: 0, message: String(e) });
      isRunningRef.current = false;
    }
  }, [javaRuntimes]);

  const killMinecraft = useCallback(async () => {
    if (!isElectron()) {
      setLaunchState({ phase: 'idle', progress: 0, message: '' });
      isRunningRef.current = false;
      return;
    }
    try {
      await window.electron!.killMinecraft();
    } catch (e) {
      console.error('Failed to kill Minecraft:', e);
    }
    isRunningRef.current = false;
  }, []);

  const selectJavaPath = useCallback(async () => {
    if (!isElectron()) return null;
    return await window.electron!.selectFile([
      { name: 'Java Executable', extensions: ['exe', ''] },
      { name: 'All Files', extensions: ['*'] },
    ]);
  }, []);

  const downloadJava = useCallback(async (version: string = '17') => {
    if (!isElectron()) return { success: false, error: 'Electron required' };
    return await window.electron!.downloadJava(version);
  }, []);

  return {
    javaRuntimes,
    systemInfo,
    launchState,
    setLaunchState,
    launch,
    killMinecraft,
    selectJavaPath,
    downloadJava,
    isElectron: isElectron(),
  };
}

export function useView() {
  const [view, setView] = useState<ViewType>('instances');
  const toggleView = useCallback((newView: ViewType) => setView(newView), []);
  return { view, toggleView };
}

export function useFpsCounter() {
  const [fps, setFps] = useState(60);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let animFrameId: number;
    const countFrame = () => {
      framesRef.current++;
      const now = performance.now();
      if (now - lastTimeRef.current >= 1000) {
        setFps(framesRef.current);
        framesRef.current = 0;
        lastTimeRef.current = now;
      }
      animFrameId = requestAnimationFrame(countFrame);
    };
    animFrameId = requestAnimationFrame(countFrame);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  return fps;
}

export function useWindowControls() {
  const minimize = useCallback(() => {
    if (isElectron()) window.electron!.minimizeWindow();
  }, []);

  const maximize = useCallback(() => {
    if (isElectron()) window.electron!.maximizeWindow();
  }, []);

  const close = useCallback(() => {
    if (isElectron()) window.electron!.closeWindow();
  }, []);

  return { minimize, maximize, close, isElectron: isElectron() };
}

// Type declarations for Electron API
declare global {
  interface Window {
    electron?: {
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      openFolder: (path?: string) => Promise<{ success: boolean; error?: string }>;
      selectFolder: () => Promise<string | null>;
      selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
      getMinecraftPath: () => Promise<string>;
      listInstances: () => Promise<Array<{ id: string; name: string; version: string; modloader: string; icon: string; path: string; lastPlayed: string; playTime: number }>>;
      createInstance: (options: { name: string; version: string; modloader: string }) => Promise<{ success: boolean; path?: string; id?: string; error?: string }>;
      deleteInstance: (instanceId: string) => Promise<{ success: boolean; error?: string }>;
      findJava: () => Promise<Array<{ path: string; name: string; version: string }>>;
      downloadJava: (version?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
      launchMinecraft: (options: {
        javaPath: string;
        javaArgs: string;
        instancePath: string;
        memory: number;
        username?: string;
        width?: number;
        height?: number;
        fullscreen?: boolean;
      }) => Promise<{ success: boolean; pid?: number; error?: string; needsDownload?: boolean }>;
      killMinecraft: () => Promise<{ success: boolean; error?: string }>;
      cancelDownload: () => Promise<{ success: boolean; error?: string }>;
      downloadContent: (url: string, instanceId: string, folder: string, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      listInstalledContent: (instanceId: string, contentType: string) => Promise<{ success: boolean; items?: Array<{ name: string; path: string; size: number }>; error?: string }>;
      deleteContent: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      microsoftLogin: () => Promise<{ success: boolean; account?: { id: string; username: string; type: string; accessToken?: string }; error?: string }>;
      onDownloadProgress?: (callback: (progress: { phase: string; progress: number }) => void) => (() => void) | undefined;
      getSystemInfo: () => Promise<{
        totalMemory: number;
        freeMemory: number;
        cpuCores: number;
        platform: string;
        arch: string;
      }>;
      saveData: (data: unknown) => Promise<{ success: boolean; error?: string }>;
      loadData: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
      onMinecraftLog?: (callback: (log: string) => void) => () => void;
      onMinecraftClosed?: (callback: (code: number) => void) => () => void;
      onMinecraftError?: (callback: (error: string) => void) => () => void;
      removeAllListeners: (channel: string) => void;
    };
    platform?: {
      isWin: boolean;
      isMac: boolean;
      isLinux: boolean;
    };
  }
}
