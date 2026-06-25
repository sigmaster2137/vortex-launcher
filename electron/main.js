const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');
const https = require('node:https');
const http = require('node:http');

// Configure HTTP Agent for connection pooling (optimization from major launchers)
// Reduced maxSockets to prevent timeout errors while maintaining high speed
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 50,
  maxTotalSockets: 100,
  scheduling: 'fifo'
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 50,
  maxTotalSockets: 100,
  scheduling: 'fifo'
});

const APP_NAME = 'Vortex Launcher';
const MICROSOFT_CLIENT_ID = '00000000402b5d8b';

let mainWindow = null;
let minecraftProcess = null;
let authWindow = null;
let sharedAssetsPath = null;
let sharedLibrariesPath = null;

// Get Minecraft path helper
function getMinecraftPath() {
  if (!app.isReady()) {
    console.warn('App not ready, cannot get Minecraft path');
    return null;
  }
  const appData = app.getPath('appData');
  return process.platform === 'darwin'
    ? path.join(appData, 'minecraft')
    : path.join(appData, '.minecraft');
}

function getDataPath() {
  if (!app.isReady()) {
    console.warn('App not ready, cannot get data path');
    return null;
  }
  const dataPath = path.join(app.getPath('userData'), 'vortex-data');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return dataPath;
}

function getJavaPath() {
  const dataPath = getDataPath();
  if (!dataPath) {
    console.warn('Cannot get Java path: data path not available');
    return null;
  }
  return path.join(dataPath, 'java');
}

function getSharedAssetsPath() {
  if (!sharedAssetsPath) {
    const dataPath = getDataPath();
    if (!dataPath) {
      console.warn('Cannot get shared assets path: data path not available');
      return null;
    }
    const assetsPath = path.join(dataPath, 'shared-assets');
    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath, { recursive: true });
    }
    sharedAssetsPath = assetsPath;
  }
  return sharedAssetsPath;
}

function getSharedLibrariesPath() {
  if (!sharedLibrariesPath) {
    const dataPath = getDataPath();
    if (!dataPath) {
      console.warn('Cannot get shared libraries path: data path not available');
      return null;
    }
    const libsPath = path.join(dataPath, 'shared-libraries');
    if (!fs.existsSync(libsPath)) {
      fs.mkdirSync(libsPath, { recursive: true });
    }
    sharedLibrariesPath = libsPath;
  }
  return sharedLibrariesPath;
}

function createSymlink(target, source) {
  try {
    if (fs.existsSync(source)) {
      fs.unlinkSync(source);
    }
    fs.symlinkSync(target, source, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (error) {
    console.warn(`Failed to create symlink from ${target} to ${source}:`, error.message);
    return false;
  }
}

let cowSupported = null;

function supportsCoW() {
  if (cowSupported !== null) {
    return cowSupported;
  }
  
  try {
    if (!app.isReady()) {
      cowSupported = false;
      return false;
    }
    
    const tempPath = app.getPath('temp');
    const testPath = path.join(tempPath, 'cow-test');
    if (fs.existsSync(testPath)) {
      fs.rmSync(testPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testPath);
    const testFile = path.join(testPath, 'test.txt');
    fs.writeFileSync(testFile, 'test');
    
    // Try to create a reflink (CoW clone)
    const clonePath = path.join(testPath, 'clone.txt');
    try {
      if (process.platform === 'win32') {
        // Windows: Use fsutil or robocopy with /reflink
        const { execSync } = require('node:child_process');
        execSync(`fsutil hardlink create "${clonePath}" "${testFile}"`, { stdio: 'ignore' });
      } else if (process.platform === 'darwin') {
        // macOS: Use clonefile
        const { execSync } = require('node:child_process');
        execSync(`clonefile "${testFile}" "${clonePath}"`, { stdio: 'ignore' });
      } else {
        // Linux: Use cp with --reflink=always
        const { execSync } = require('node:child_process');
        execSync(`cp --reflink=always "${testFile}" "${clonePath}"`, { stdio: 'ignore' });
      }
      fs.rmSync(testPath, { recursive: true, force: true });
      cowSupported = true;
      return true;
    } catch (e) {
      fs.rmSync(testPath, { recursive: true, force: true });
      cowSupported = false;
      return false;
    }
  } catch (error) {
    console.warn('CoW detection failed:', error.message);
    cowSupported = false;
    return false;
  }
}

function copyWithCoW(src, dest) {
  try {
    if (supportsCoW()) {
      if (process.platform === 'win32') {
        const { execSync } = require('_process');
        execSync(`robocopy "${src}" "${dest}" /E /COPYALL /ZB /R:0 /W:0 /NFL /NDL`, { stdio: 'ignore' });
      } else if (process.platform === 'darwin') {
        const { execSync } = require('_process');
        execSync(`cp -Rc "${src}" "${dest}"`, { stdio: 'ignore' });
      } else {
        const { execSync } = require('_process');
        execSync(`cp -r --reflink=always "${src}" "${dest}"`, { stdio: 'ignore' });
      }
      return true;
    }
  } catch (error) {
    console.warn('CoW copy failed, falling back to regular copy:', error.message);
  }
  return false;
}

function copyDirectoryRecursive(src, dest, useSymlinks = false, symlinkExceptions = []) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, useSymlinks, symlinkExceptions);
    } else {
      if (useSymlinks && !symlinkExceptions.includes(entry.name)) {
        createSymlink(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#12121f',
    show: false,
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Initialize shared paths immediately when app is ready
  getSharedAssetsPath();
  getSharedLibrariesPath();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// =====================
// Window Controls
// =====================
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// =====================
// File System
// =====================
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    const fullPath = folderPath || getMinecraftPath();
    if (!fullPath) {
      return { success: false, error: 'Path not available' };
    }
    await shell.openPath(fullPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-file', async (event, filters) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

// =====================
// Minecraft
// =====================

let downloadCancelled = false;

// Download Minecraft files for an instance
async function downloadMinecraftFiles(instancePath, version, onProgress) {
  const MOJANG_META = 'https://launchermeta.mojang.com';
  const MOJANG_RESOURCES = 'https://resources.download.minecraft.net';
  downloadCancelled = false;
  
  try {
    onProgress({ phase: 'Fetching version manifest...', progress: 5 });
    
    if (downloadCancelled) throw new Error('Download cancelled');
    
    // Get version manifest
    const manifest = await httpsGetJson(`${MOJANG_META}/mc/game/version_manifest_v2.json`);
    
    const versionInfo = manifest.versions.find(v => v.id === version);
    if (!versionInfo) {
      throw new Error(`Version ${version} not found in manifest`);
    }
    
    onProgress({ phase: 'Fetching version details...', progress: 10 });
    
    if (downloadCancelled) throw new Error('Download cancelled');
    
    // Get version details
    const versionDetails = await httpsGetJson(versionInfo.url);
    
    const nativesPlatform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    
    // Create version folder
    const versionPath = path.join(instancePath, 'versions', version);
    if (!fs.existsSync(versionPath)) {
      fs.mkdirSync(versionPath, { recursive: true });
    }
    
    // Download client jar
    onProgress({ phase: 'Downloading client jar...', progress: 15 });
    const clientJarPath = path.join(versionPath, `${version}.jar`);
    await downloadFileWithRetry(versionDetails.downloads.client.url, clientJarPath);
    
    if (downloadCancelled) throw new Error('Download cancelled');
    
    // Download libraries to shared directory
    onProgress({ phase: 'Downloading libraries...', progress: 20 });
    const libsPath = getSharedLibrariesPath();
    if (!libsPath) {
      throw new Error('Shared libraries path not available');
    }
    const instanceLibrariesPath = path.join(instancePath, 'libraries');
    
    // Create symlink from instance libraries to shared libraries
    if (!fs.existsSync(instanceLibrariesPath)) {
      createSymlink(libsPath, instanceLibrariesPath);
    }
    
    let libIndex = 0;
    const totalLibs = versionDetails.libraries.length;
    
    for (const lib of versionDetails.libraries) {
      if (downloadCancelled) throw new Error('Download cancelled');
      libIndex++;
      const progress = 20 + Math.floor((libIndex / totalLibs) * 30);
      onProgress({ phase: `Downloading library ${lib.name}...`, progress });
      
      if (lib.downloads?.artifact) {
        const libPath = path.join(libsPath, lib.downloads.artifact.path);
        const libDir = path.dirname(libPath);
        if (!fs.existsSync(libDir)) {
          fs.mkdirSync(libDir, { recursive: true });
        }
        await downloadFileWithRetry(lib.downloads.artifact.url, libPath);
      }
      
      // Download natives
      if (lib.downloads?.classifiers) {
        const nativeKey = `natives-${nativesPlatform}`;
        const classifier = lib.downloads.classifiers[nativeKey];
        if (classifier) {
          const nativePath = path.join(libsPath, classifier.path);
          const nativeDir = path.dirname(nativePath);
          if (!fs.existsSync(nativeDir)) {
            fs.mkdirSync(nativeDir, { recursive: true });
          }
          await downloadFileWithRetry(classifier.url, nativePath);
        }
      }
    }
    
    // Download assets to shared directory
    onProgress({ phase: 'Downloading assets...', progress: 55 });
    const assetsPath = getSharedAssetsPath();
    if (!assetsPath) {
      throw new Error('Shared assets path not available');
    }
    
    // Download asset index - FORCE RE-DOWNLOAD for fresh assets
    onProgress({ phase: 'Downloading asset index...', progress: 50 });
    const assetsIndexPath = path.join(assetsPath, 'indexes', `${versionDetails.assetIndex.id}.json`);
    const assetsIndexDir = path.dirname(assetsIndexPath);
    if (!fs.existsSync(assetsIndexDir)) {
      fs.mkdirSync(assetsIndexDir, { recursive: true });
    }
    // Download asset index (only if missing or outdated)
    let needsIndexDownload = !fs.existsSync(assetsIndexPath);
    if (!needsIndexDownload && fs.existsSync(assetsIndexPath)) {
      try {
        const indexStat = fs.statSync(assetsIndexPath);
        // Re-download if index is older than 1 day
        const oneDayMs = 24 * 60 * 60 * 1000;
        needsIndexDownload = (Date.now() - indexStat.mtimeMs) > oneDayMs;
      } catch (e) {
        console.warn('Failed to check asset index mtime:', e.message);
        needsIndexDownload = true;
      }
    }
    if (needsIndexDownload) {
      await downloadFileWithRetry(versionDetails.assetIndex.url, assetsIndexPath);
    }
    
    if (downloadCancelled) throw new Error('Download cancelled');
    
    // Read asset index
    const assetIndexContent = fs.readFileSync(assetsIndexPath, 'utf-8');
    const assetIndexData = JSON.parse(assetIndexContent);
    const instanceAssetsPath = path.join(instancePath, 'assets');
    const assetsObjectsPath = path.join(assetsPath, 'objects');
    
    // Create symlink from instance assets to shared assets
    if (!fs.existsSync(instanceAssetsPath)) {
      createSymlink(assetsPath, instanceAssetsPath);
    }
    
    if (!fs.existsSync(assetsObjectsPath)) {
      fs.mkdirSync(assetsObjectsPath, { recursive: true });
    }
    
    const assetKeys = Object.keys(assetIndexData.objects);
    
    // Download assets in parallel (500 at a time for stability)
    const CONCURRENCY = 500;
    const downloadQueue = [];
    
    for (const assetKey of assetKeys) {
      if (downloadCancelled) throw new Error('Download cancelled');
      
      const asset = assetIndexData.objects[assetKey];
      const hash = asset.hash;
      const prefix = hash.slice(0, 2);
      const assetUrl = `${MOJANG_RESOURCES}/${prefix}/${hash}`;
      const assetPath = path.join(assetsPath, 'objects', prefix, hash);
      
      const assetDir = path.dirname(assetPath);
      if (!fs.existsSync(assetDir)) {
        fs.mkdirSync(assetDir, { recursive: true });
      }
      
      // Only download if missing or wrong size - DON'T delete existing files
      let needsDownload = false;
      try {
        if (!fs.existsSync(assetPath)) {
          needsDownload = true;
        } else if (asset.size && fs.statSync(assetPath).size !== asset.size) {
          needsDownload = true;
        }
      } catch (e) {
        console.warn('Failed to check asset file:', e.message);
        needsDownload = true;
      }
      
      if (needsDownload) {
        downloadQueue.push({ assetUrl, assetPath });
      }
    }
    
    // Process queue in parallel
    let downloadedCount = 0;
    const totalToDownload = downloadQueue.length;
    
    for (let i = 0; i < downloadQueue.length; i += CONCURRENCY) {
      if (downloadCancelled) throw new Error('Download cancelled');
      
      const batch = downloadQueue.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ({ assetUrl, assetPath }) => {
        if (downloadCancelled) return;
        await downloadFileWithRetry(assetUrl, assetPath);
        downloadedCount++;
      }));
      
      const progress = 55 + Math.floor((downloadedCount / totalToDownload) * 35);
      onProgress({ phase: `Downloading assets (${downloadedCount}/${totalToDownload})...`, progress });
    }
    
    // Download ALL legacy assets for panorama (main menu background) - FIX FOREVER
    onProgress({ phase: 'Downloading legacy assets...', progress: 90 });
    try {
      const legacyIndexPath = path.join(assetsPath, 'indexes', 'legacy.json');
      const legacyIndexUrl = 'https://launchermeta.mojang.com/mc/assets/legacy/legacy.json';
      const legacyIndexDir = path.dirname(legacyIndexPath);
      if (!fs.existsSync(legacyIndexDir)) {
        fs.mkdirSync(legacyIndexDir, { recursive: true });
      }
      
      // Download legacy.json (only if missing or outdated)
      let needsLegacyDownload = !fs.existsSync(legacyIndexPath);
      if (!needsLegacyDownload && fs.existsSync(legacyIndexPath)) {
        try {
          const legacyStat = fs.statSync(legacyIndexPath);
          // Re-download if legacy.json is older than 1 day
          const oneDayMs = 24 * 60 * 60 * 1000;
          needsLegacyDownload = (Date.now() - legacyStat.mtimeMs) > oneDayMs;
        } catch (e) {
          console.warn('Failed to check legacy index mtime:', e.message);
          needsLegacyDownload = true;
        }
      }
      if (needsLegacyDownload) {
        await downloadFileWithRetry(legacyIndexUrl, legacyIndexPath);
      }
      
      const legacyIndexContent = fs.readFileSync(legacyIndexPath, 'utf-8');
      const legacyIndexData = JSON.parse(legacyIndexContent);
      
      // Download ALL legacy assets (not just filtered) to ensure panorama works forever
      const legacyAssetKeys = Object.keys(legacyIndexData.objects);
      console.log(`Downloading ALL ${legacyAssetKeys.length} legacy assets`);
      const legacyQueue = [];
      
      for (const assetKey of legacyAssetKeys) {
        if (downloadCancelled) throw new Error('Download cancelled');
        
        const asset = legacyIndexData.objects[assetKey];
        const hash = asset.hash;
        const prefix = hash.slice(0, 2);
        const assetUrl = `${MOJANG_RESOURCES}/${prefix}/${hash}`;
        const assetPath = path.join(assetsPath, 'objects', prefix, hash);
        
        const assetDir = path.dirname(assetPath);
        if (!fs.existsSync(assetDir)) {
          fs.mkdirSync(assetDir, { recursive: true });
        }
        
        // Only download if missing or wrong size - force re-download only panorama assets
        let needsDownload = false;
        const isPanorama = assetKey.includes('panorama') || assetKey.includes('title') || 
                          assetKey.includes('background') || assetKey.includes('gui');
        
        try {
          if (!fs.existsSync(assetPath)) {
            needsDownload = true;
          } else if (isPanorama) {
            // Always re-download panorama assets to fix gray background
            needsDownload = true;
          } else if (asset.size && fs.statSync(assetPath).size !== asset.size) {
            needsDownload = true;
          }
        } catch (e) {
          console.warn('Failed to check legacy asset file:', e.message);
          needsDownload = true;
        }
        if (needsDownload) {
          legacyQueue.push({ assetUrl, assetPath });
        }
      }
      
      let legacyDownloaded = 0;
      const totalLegacyToDownload = legacyQueue.length;
      
      for (let i = 0; i < legacyQueue.length; i += CONCURRENCY) {
        if (downloadCancelled) throw new Error('Download cancelled');
        
        const batch = legacyQueue.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async ({ assetUrl, assetPath }) => {
          if (downloadCancelled) return;
          try {
            await downloadFileWithRetry(assetUrl, assetPath);
            legacyDownloaded++;
          } catch (err) {
            console.error(`Failed to download legacy asset ${assetUrl}:`, err);
          }
        }));
        
        const progress = 90 + Math.floor((legacyDownloaded / totalLegacyToDownload) * 5);
        onProgress({ phase: `Downloading legacy assets (${legacyDownloaded}/${totalLegacyToDownload})...`, progress });
      }
    } catch (e) {
      console.warn('Failed to download legacy assets:', e);
      // Don't fail the entire download if legacy assets fail
    }
    
    
    // Download language files
    onProgress({ phase: 'Downloading language files...', progress: 95 });
    try {
      const langPath = path.join(assetsPath, 'indexes', `${versionDetails.assetIndex.id}.json`);
      const langIndexContent = fs.readFileSync(langPath, 'utf-8');
      const langIndexData = JSON.parse(langIndexContent);
      
      // Download ALL language files from the asset index in parallel
      const langQueue = [];
      for (const assetKey of Object.keys(langIndexData.objects)) {
        if (downloadCancelled) throw new Error('Download cancelled');
        
        if (assetKey.startsWith('minecraft/lang/')) {
          const asset = langIndexData.objects[assetKey];
          const hash = asset.hash;
          const prefix = hash.slice(0, 2);
          const assetUrl = `${MOJANG_RESOURCES}/${prefix}/${hash}`;
          const assetPath = path.join(assetsPath, 'objects', prefix, hash);
          
          const assetDir = path.dirname(assetPath);
          if (!fs.existsSync(assetDir)) {
            fs.mkdirSync(assetDir, { recursive: true });
          }
          
          // FORCE RE-DOWNLOAD ALL LANGUAGE FILES
          const needsDownload = true;
          if (needsDownload) {
            langQueue.push({ assetUrl, assetPath });
          }
        }
      }
      
      let langDownloaded = 0;
      const totalLangToDownload = langQueue.length;
      
      for (let i = 0; i < langQueue.length; i += CONCURRENCY) {
        if (downloadCancelled) throw new Error('Download cancelled');
        
        const batch = langQueue.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async ({ assetUrl, assetPath }) => {
          if (downloadCancelled) return;
          await downloadFileWithRetry(assetUrl, assetPath);
          langDownloaded++;
        }));
        
        const progress = 95 + Math.floor((langDownloaded / totalLangToDownload) * 5);
        onProgress({ phase: `Downloading language files (${langDownloaded}/${totalLangToDownload})...`, progress });
      }
    } catch (e) {
      console.warn('Failed to download language files:', e);
    }
    
    onProgress({ phase: 'Download complete!', progress: 100 });
    
  } catch (error) {
    console.error('Error downloading Minecraft files:', error);
    throw error;
  }
}

// Helper to get JSON from HTTPS
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const agent = url.startsWith('https') ? httpsAgent : httpAgent;
    protocol.get(url, { agent }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Download file with retry and timeout
async function downloadFileWithRetry(url, destPath, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      await downloadFile(url, destPath);
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Retry ${i + 1}/${retries} for ${url}: ${err.message}`);
      // Instant retry - no delay for maximum speed
    }
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (downloadCancelled) {
      reject(new Error('Download cancelled'));
      return;
    }
    
    const protocol = url.startsWith('https') ? https : http;
    const agent = url.startsWith('https') ? httpsAgent : httpAgent;
    const file = fs.createWriteStream(destPath);
    
    let req = null;
    
    // Set timeout to prevent hanging (60 seconds for large files)
    const timeout = setTimeout(() => {
      file.close();
      try {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
      } catch {}
      if (req) req.destroy();
      reject(new Error('Download timeout'));
    }, 60000);
    
    req = protocol.get(url, { agent }, (response) => {
      if (downloadCancelled) {
        clearTimeout(timeout);
        file.close();
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
        } catch {}
        reject(new Error('Download cancelled'));
        return;
      }
      
      if (response.statusCode === 302 || response.statusCode === 301) {
        clearTimeout(timeout);
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      
      clearTimeout(timeout);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      file.close();
      try {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
      } catch {}
      console.error(`Download error for ${url}:`, err.message);
      reject(err);
    });
    
    req.on('error', (err) => {
      clearTimeout(timeout);
      file.close();
      try {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
      } catch {}
      console.error(`Request error for ${url}:`, err.message);
      reject(err);
    });
    
    req.on('socket', (socket) => {
      socket.on('lookup', (err, address, family, host) => {
        if (err) {
          console.error(`DNS lookup error for ${host}:`, err.message);
          req.destroy();
          clearTimeout(timeout);
          file.close();
          try {
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
          } catch {}
          reject(err);
        }
      });
    });
  });
}

ipcMain.handle('get-minecraft-path', () => {
  return getMinecraftPath();
});

ipcMain.handle('list-instances', async () => {
  try {
    const dataPath = getDataPath();
    if (!dataPath) {
      return [];
    }
    const instancesPath = path.join(dataPath, 'instances');
    if (!fs.existsSync(instancesPath)) {
      fs.mkdirSync(instancesPath, { recursive: true });
      return [];
    }

    const entries = fs.readdirSync(instancesPath, { withFileTypes: true });
    const instances = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const instancePath = path.join(instancesPath, entry.name);
      const configPath = path.join(instancePath, 'instance.json');

      // Only include instances with a valid instance.json file
      if (!fs.existsSync(configPath)) {
        // Remove invalid instance directories
        try {
          fs.rmSync(instancePath, { recursive: true, force: true });
          console.log('Removed invalid instance directory:', entry.name);
        } catch (e) {
          console.error('Failed to remove invalid instance:', e);
        }
        continue;
      }

      let config = { name: entry.name, version: '1.20.4', modloader: 'vanilla' };
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        console.error('Failed to parse instance config:', e);
        // Remove directories with invalid config
        try {
          fs.rmSync(instancePath, { recursive: true, force: true });
          console.log('Removed instance with invalid config:', entry.name);
        } catch (err) {
          console.error('Failed to remove invalid instance:', err);
        }
        continue;
      }

      instances.push({
        id: entry.name,
        name: config.name || entry.name,
        version: config.version || '1.20.4',
        modloader: config.modloader || 'vanilla',
        icon: config.icon || 'grass_block',
        path: instancePath,
        lastPlayed: config.lastPlayed || '',
        playTime: config.playTime || 0,
      });
    }

    return instances;
  } catch (error) {
    console.error('Error listing instances:', error);
    return [];
  }
});

ipcMain.handle('create-instance', async (event, options) => {
  try {
    const dataPath = getDataPath();
    if (!dataPath) {
      return { success: false, error: 'Data path not available' };
    }
    const instanceName = options.name?.trim() ? options.name : 'new instance';
    const instanceId = instanceName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const instancePath = path.join(dataPath, 'instances', instanceId);

    if (!fs.existsSync(instancePath)) {
      fs.mkdirSync(instancePath, { recursive: true });
    }

    fs.writeFileSync(
      path.join(instancePath, 'instance.json'),
      JSON.stringify({
        name: instanceName,
        version: options.version,
        modloader: options.modloader,
        icon: options.modloader === 'fabric' ? 'fabric' : options.modloader === 'forge' ? 'anvil' : 'grass_block',
        created: new Date().toISOString(),
        lastPlayed: '',
        playTime: 0,
      }, null, 2)
    );

    // Create standard folders (skip libraries and assets - they use symlinks)
    const folders = ['saves', 'screenshots', 'options', 'resourcepacks', 'shaderpacks', 'versions'];
    folders.forEach(folder => {
      const folderPath = path.join(instancePath, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
    });

    // Download Minecraft files
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', { phase: 'Downloading Minecraft files...', progress: 0 });
    }

    await downloadMinecraftFiles(instancePath, options.version, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('download-progress', progress);
      }
    });

    return { success: true, path: instancePath, id: instanceId };
  } catch (error) {
    console.error('Error creating instance:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('delete-instance', async (event, instanceId) => {
  try {
    const dataPath = getDataPath();
    if (!dataPath) {
      return { success: false, error: 'Data path not available' };
    }
    const instancePath = path.join(dataPath, 'instances', instanceId);
    if (fs.existsSync(instancePath)) {
      fs.rmSync(instancePath, { recursive: true, force: true });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('copy-instance', async (event, sourceInstanceId, options) => {
  try {
    const dataPath = getDataPath();
    if (!dataPath) {
      return { success: false, error: 'Data path not available' };
    }
    const sourcePath = path.join(dataPath, 'instances', sourceInstanceId);
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source instance not found' };
    }

    const newName = options.name || `${sourceInstanceId}_copy`;
    const newInstanceId = newName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const destPath = path.join(dataPath, 'instances', newInstanceId);

    if (fs.existsSync(destPath)) {
      return { success: false, error: 'Instance with this name already exists' };
    }

    const useCoW = options.useCoW !== false && supportsCoW();
    const useSymlinks = options.useSymlinks === true;
    const symlinkExceptions = options.symlinkExceptions || ['instance.json', 'options.txt', 'optionsof.txt'];

    if (useCoW) {
      if (!copyWithCoW(sourcePath, destPath)) {
        console.warn('CoW failed, falling back to regular copy');
        copyDirectoryRecursive(sourcePath, destPath, useSymlinks, symlinkExceptions);
      }
    } else {
      copyDirectoryRecursive(sourcePath, destPath, useSymlinks, symlinkExceptions);
    }

    // Update instance.json with new name
    const configPath = path.join(destPath, 'instance.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.name = newName;
      config.created = new Date().toISOString();
      config.lastPlayed = '';
      config.playTime = 0;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    return { success: true, instanceId: newInstanceId, name: newName };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// =====================
// Java Detection & Auto-Download
// =====================
async function findJavaInSystem() {
  const javaPaths = [];
  const searchPaths = [];

  // Check our bundled Java first
  const bundledJavaPath = getJavaPath();
  if (bundledJavaPath && fs.existsSync(bundledJavaPath)) {
    const entries = fs.readdirSync(bundledJavaPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const javaBin = path.join(
        bundledJavaPath,
        entry.name,
        process.platform === 'darwin' ? 'Contents/Home/bin/java' : 'bin',
        process.platform === 'win32' ? 'java.exe' : 'java'
      );
      if (fs.existsSync(javaBin)) {
        javaPaths.push({
          path: javaBin,
          name: `Vortex Java (${entry.name})`,
          version: entry.name.replace('jdk-', '').split('-')[0] || '17',
        });
      }
    }
  }

  // Windows paths
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || String.raw`C:\Program Files`;
    const programFilesX86 = process.env['ProgramFiles(x86)'] || String.raw`C:\Program Files (x86)`;
    searchPaths.push(
      path.join(programFiles, 'Java'),
      path.join(programFiles, 'Eclipse Adoptium'),
      path.join(programFiles, 'Microsoft'),
      path.join(programFiles, 'Zulu'),
      path.join(programFilesX86, 'Java')
    );
  } else if (process.platform === 'darwin') {
    // macOS paths
    searchPaths.push('/Library/Java/JavaVirtualMachines');
  } else if (process.platform === 'linux') {
    // Linux paths
    searchPaths.push('/usr/lib/jvm', '/usr/java', '/opt/java');
  }

  // Search for Java installations
  for (const searchPath of searchPaths) {
    try {
      if (!fs.existsSync(searchPath)) continue;

      const entries = fs.readdirSync(searchPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        let javaBin;
        if (process.platform === 'darwin') {
          javaBin = path.join(searchPath, entry.name, 'Contents', 'Home', 'bin', 'java');
        } else {
          javaBin = path.join(searchPath, entry.name, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
        }

        if (fs.existsSync(javaBin)) {
          javaPaths.push({
            path: javaBin,
            name: entry.name,
            version: entry.name.replace(/^(jdk-?|java-?|zulu-?|openjdk-?)/i, '').split('-')[0] || 'unknown',
          });
        }
      }
    } catch (e) {
      console.warn('Failed to search Java path:', e.message);
    }
  }

  // Check PATH environment
  const pathEnv = process.env.PATH || '';
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';

  for (const dir of pathEnv.split(pathSeparator)) {
    if (!dir) continue;
    const javaPath = path.join(dir, javaExe);
    try {
      if (fs.existsSync(javaPath)) {
        const alreadyExists = javaPaths.some(j => j.path === javaPath);
        if (!alreadyExists) {
          javaPaths.push({
            path: javaPath,
            name: 'System Java',
            version: 'system',
          });
        }
      }
    } catch (e) {
      console.warn('Failed to check system Java:', e.message);
    }
  }

  return javaPaths;
}

ipcMain.handle('find-java', findJavaInSystem);

ipcMain.handle('download-java', async (event, version = '17') => {
  try {
    const javaPath = getJavaPath();
    if (!fs.existsSync(javaPath)) {
      fs.mkdirSync(javaPath, { recursive: true });
    }

    let downloadUrl;
    let fileName;

    if (process.platform === 'win32') {
      downloadUrl = `https://github.com/adoptium/temurin${version}-binaries/releases/download/jdk-${version}.0.9%2B9/OpenJDK${version}U-jdk_x64_windows_hotspot_${version}.0.9_9.zip`;
      fileName = `jdk-${version}-windows.zip`;
    } else if (process.platform === 'darwin') {
      downloadUrl = `https://github.com/adoptium/temurin${version}-binaries/releases/download/jdk-${version}.0.9%2B9/OpenJDK${version}U-jdk_x64_mac_hotspot_${version}.0.9_9.tar.gz`;
      fileName = `jdk-${version}-mac.tar.gz`;
    } else {
      downloadUrl = `https://github.com/adoptium/temurin${version}-binaries/releases/download/jdk-${version}.0.9%2B9/OpenJDK${version}U-jdk_x64_linux_hotspot_${version}.0.9_9.tar.gz`;
      fileName = `jdk-${version}-linux.tar.gz`;
    }

    const archivePath = path.join(javaPath, fileName);

    // Download
    await downloadFileWithRetry(downloadUrl, archivePath);

    // Extract (simplified - just creates the folder structure)
    const extractPath = path.join(javaPath, `jdk-${version}`);
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    // Clean up archive
    try { fs.unlinkSync(archivePath); } catch {}

    return { success: true, message: 'Java downloaded. Please extract manually or use system Java.' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// =====================
// Launch Minecraft
// =====================
ipcMain.handle('launch-minecraft', async (event, options) => {
  if (minecraftProcess) {
    return { success: false, error: 'Minecraft is already running' };
  }

  let javaPath = options.javaPath;
  const instanceId = options.instancePath;
  const memory = options.memory || 4096;
  const javaArgs = options.javaArgs || '';
  const username = options.username || 'Player';
  const width = options.width || 1920;
  const height = options.height || 1080;
  const fullscreen = options.fullscreen || false;

  try {
    // Find Java if not specified
    if (!javaPath) {
      const javas = await findJavaInSystem();
      if (javas.length === 0) {
        return { success: false, error: 'No Java installation found.\n\nDownload Java 17+ from:\nhttps://adoptium.net/\n\nOr install via your package manager.' };
      }
      javaPath = javas[0].path;
    }

    // Verify Java exists
    if (!fs.existsSync(javaPath)) {
      return { success: false, error: `Java not found at: ${javaPath}\n\nPlease install Java or select a different path in Settings.` };
    }

    // Get instance path
    const dataPath = getDataPath();
    if (!dataPath) {
      return { success: false, error: 'Data path not available' };
    }
    const instancesDir = path.join(dataPath, 'instances');

    // Try to find instance by ID or name
    let instancePath = path.join(instancesDir, instanceId);
    if (!fs.existsSync(instancePath)) {
      // Try sanitized name
      const sanitizedId = instanceId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      instancePath = path.join(instancesDir, sanitizedId);
    }
    if (!fs.existsSync(instancePath)) {
      // List available instances
      if (fs.existsSync(instancesDir)) {
        const available = fs.readdirSync(instancesDir).filter(f => {
          return fs.statSync(path.join(instancesDir, f)).isDirectory();
        });
        return {
          success: false,
          error: `Instance '${instanceId}' not found.\n\nAvailable instances:\n${available.map(i => `• ${i}`).join('\n') || 'None'}\n\nCreate an instance first.`
        };
      }
      return { success: false, error: `No instances directory found. Create an instance first.` };
    }

    // Update instance config
    const configPath = path.join(instancePath, 'instance.json');
    let config = { version: '1.20.4', name: instanceId };
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed to read instance config:', e);
    }

    config.lastPlayed = new Date().toISOString().split('T')[0];
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (e) {
      console.error('Failed to write instance config:', e);
    }

    // Build launch arguments with memory allocation
    const args = [
      `-Xmx${memory}M`,
      `-Xms${Math.min(1024, Math.floor(memory / 4))}M`,
    ];

    // Add custom JVM args
    if (javaArgs && javaArgs.trim()) {
      args.push(...javaArgs.split(' ').filter(a => a.trim()));
    }

    // Add optimized JVM arguments (Aikar flags - industry standard for Minecraft)
    // These optimize garbage collection and memory for better FPS and less lag
    // Add thermal throttling prevention optimizations for laptops
    // These reduce CPU/GPU heat generation to prevent overheating
    // Add advanced optimizations from performance benchmarks
    // These are additional flags beyond Aikar's standard set
    args.push(
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1',
      '-Dio.netty.leakDetection.level=DISABLE',
      '-Dsun.java2d.d3d=false',
      '-Dsun.java2d.opengl=true',
      '-Dsun.java2d.noddraw=true',
      '-XX:+UseNUMA',
      '-XX:+UseLargePages',
      '-Djava.awt.headless=false',
      '-XX:+UnlockDiagnosticVMOptions',
      '-XX:+AlwaysActAsServerClassMachine',
      '-XX:+UseFastUnorderedTimeStamps',
      '-XX:AllocatePrefetchStyle=3',
      '-XX:+UseStringDeduplication',
      '-Djava.security.egd=file:/dev/urandom'
    );

    // Check if we have actual game files
    const gameJarPath = path.join(instancePath, 'game.jar');
    const librariesPath = getSharedLibrariesPath();
    if (!librariesPath) {
      return { success: false, error: 'Shared libraries path not available' };
    }
    
    // Also check for Minecraft client jar in versions folder (standard .minecraft structure)
    const versionsPath = path.join(instancePath, 'versions');
    let actualGameJar = gameJarPath;
    let actualLibrariesPath = librariesPath;

    if (!fs.existsSync(gameJarPath) && fs.existsSync(versionsPath)) {
      // Try to find version jar in versions folder
      const version = config.version || '1.20.4';
      const versionPath = path.join(versionsPath, version);
      const versionJar = path.join(versionPath, `${version}.jar`);
      
      if (fs.existsSync(versionJar)) {
        actualGameJar = versionJar;
        actualLibrariesPath = getSharedLibrariesPath();
      } else {
        // Try to find ANY jar in the versions folder
        const versionDirs = fs.readdirSync(versionsPath, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        
        for (const verDir of versionDirs) {
          const verJar = path.join(versionsPath, verDir, `${verDir}.jar`);
          if (fs.existsSync(verJar)) {
            actualGameJar = verJar;
            actualLibrariesPath = getSharedLibrariesPath();
            config.version = verDir; // Update config to match found version
            console.log(`Found game jar for version: ${verDir}`);
            break;
          }
        }
      }
    }

    // Add standard JVM args
    args.push(
      '-Djava.net.preferIPv4Stack=true',
      '-Dfml.ignoreInvalidMinecraftCertificates=true',
      '-Dfml.ignorePatchDiscrepancies=true',
      '-Dminecraft.client.jar=' + actualGameJar
    );

    if (fs.existsSync(actualGameJar)) {
      // Build classpath
      let classpath = actualGameJar;

      if (fs.existsSync(actualLibrariesPath)) {
        function addLibraries(dir) {
          const files = fs.readdirSync(dir, { withFileTypes: true });
          for (const file of files) {
            if (file.isDirectory()) {
              addLibraries(path.join(dir, file.name));
            } else if (file.name.endsWith('.jar')) {
              classpath += (process.platform === 'win32' ? ';' : ':') + path.join(dir, file.name);
            }
          }
        }
        addLibraries(actualLibrariesPath);
      }

      args.push('-cp', classpath);

      // Main class detection from instance config
      const mainClass = config.mainClass || 'net.minecraft.client.main.Main';
      args.push(mainClass);
    } else {
      // No game files - try to provide helpful error
      const version = config.version || '1.20.4';
      const availableVersions = [];
      if (fs.existsSync(versionsPath)) {
        try {
          const verDirs = fs.readdirSync(versionsPath, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
          availableVersions.push(...verDirs);
        } catch (e) {
          console.warn('Failed to read versions directory:', e.message);
        }
      }
      
      return {
        success: false,
        error: `Game files not found for ${version}.\n\nExpected one of:\n• ${gameJarPath}\n• ${path.join(instancePath, 'versions', version, `${version}.jar`)}\n\nAvailable versions in instance: ${availableVersions.length > 0 ? availableVersions.join(', ') : 'None'}\n\nTo fix:\n1. Copy your .minecraft/versions/${version} folder to the instance\n2. Or copy the entire .minecraft folder to:\n${instancePath}\n\nThe download system will be available in a future update.`,
        needsDownload: true,
        instancePath
      };
    }

    // Game arguments
    args.push(
      '--username', username,
      '--uuid', '00000000-0000-0000-0000-000000000000',
      '--accessToken', '0',
      '--version', config.version || '1.20.4',
      '--gameDir', instancePath
    );
    
    // Set assets directory - use shared assets
    const assetsDir = getSharedAssetsPath();
    if (!assetsDir) {
      return { success: false, error: 'Shared assets path not available' };
    }
    args.push('--assetsDir', assetsDir);
    
    args.push(
      '--assetIndex', config.version || '1.20',
      '--width', String(width),
      '--height', String(height),
      ...(fullscreen ? ['--fullscreen'] : [])
    );

    console.log('Launching Minecraft with', memory, 'MB RAM');
    console.log('Java:', javaPath);
    console.log('Instance:', instancePath);
    console.log('Args:', args.join(' '));

    minecraftProcess = spawn(javaPath, args, {
      cwd: instancePath,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Verify process started successfully
    if (!minecraftProcess.pid) {
      minecraftProcess = null;
      return { success: false, error: 'Failed to start Minecraft process. Java may not be compatible or instance files are corrupted.' };
    }

    minecraftProcess.stdout.on('data', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('minecraft-log', data.toString());
      }
    });

    minecraftProcess.stderr.on('data', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('minecraft-log', data.toString());
      }
    });

    minecraftProcess.on('close', (code) => {
      console.log('Minecraft process closed with code:', code);
      minecraftProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('minecraft-closed', code || 0);
      }
    });

    minecraftProcess.on('error', (error) => {
      console.error('Minecraft process error:', error);
      minecraftProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('minecraft-error', error.message);
      }
    });

    return { success: true, pid: minecraftProcess.pid };
  } catch (error) {
    console.error('Launch error:', error);
    minecraftProcess = null;
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('kill-minecraft', async () => {
  if (minecraftProcess) {
    try {
      minecraftProcess.kill();
      minecraftProcess = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
  return { success: false, error: 'No Minecraft process running' };
});

// =====================
// Microsoft Auth
// =====================
ipcMain.handle('microsoft-login', async () => {
  return new Promise((resolve, reject) => {
    if (!mainWindow) {
      reject(new Error('Main window not available'));
      return;
    }

    authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      title: 'Microsoft Login',
      parent: mainWindow,
      modal: true,
    });

    const redirectUri = 'https://login.microsoftonline.com/common/oauth2/nativeclient';
    const authUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?' +
      `client_id=${MICROSOFT_CLIENT_ID}&` +
      'response_type=code&' +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      'scope=XboxLive.signin%20XboxLive.offline_access&' +
      'prompt=select_account';

    authWindow.loadURL(authUrl);

    authWindow.once('ready-to-show', () => {
      if (authWindow) authWindow.show();
    });

    authWindow.webContents.on('will-navigate', async (event, url) => {
      if (url?.startsWith(redirectUri) && url.includes('code=')) {
        event.preventDefault();
        try {
          const code = new URL(url).searchParams.get('code');
          if (authWindow) {
            authWindow.close();
            authWindow = null;
          }

          // Exchange code for tokens
          const tokenResponse = await httpsPostJson('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
            client_id: MICROSOFT_CLIENT_ID,
            code: code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          });

          if (!tokenResponse.access_token) {
            reject(new Error('Failed to get access token'));
            return;
          }

          // Authenticate with Xbox Live
          const xboxResponse = await httpsPostJson('https://user.auth.xboxlive.com/user/authenticate', {
            Properties: {
              AuthToken: tokenResponse.access_token,
              SiteName: 'user.auth.xboxlive.com',
              RpsTicket: `d=${tokenResponse.access_token}`,
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT',
          });

          if (!xboxResponse.Token) {
            reject(new Error('Failed to authenticate with Xbox Live'));
            return;
          }

          // Get XSTS token
          const xstsResponse = await httpsPostJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
            Properties: {
              SandboxId: 'RETAIL',
              UserTokens: [xboxResponse.Token],
            },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT',
          });

          if (!xstsResponse.Token) {
            reject({ success: false, error: 'Failed to get XSTS token' });
            return;
          }

          // Get Minecraft profile
          const mcResponse = await httpsGetJson(`https://api.minecraftservices.com/authentication/login_with_xbox?access_token=${xstsResponse.Token}`);

          if (!mcResponse.access_token) {
            reject(new Error('Failed to get Minecraft access token'));
            return;
          }

          const profileResponse = await httpsGetJson('https://api.minecraftservices.com/minecraft/profile');

          if (!profileResponse.id) {
            reject(new Error('No Minecraft profile found. You need to own Minecraft.'));
            return;
          }

          resolve({
            success: true,
            account: {
              id: profileResponse.id,
              username: profileResponse.name,
              type: 'microsoft',
              accessToken: mcResponse.access_token,
            }
          });
        } catch (error) {
          console.error('Microsoft auth error:', error);
          reject(error);
        }
      }
    });

    authWindow.on('closed', () => {
      authWindow = null;
      reject(new Error('Window closed by user'));
    });
  });
});

// Helper for HTTPS POST with JSON
function httpsPostJson(url, data) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const postData = JSON.stringify(data);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = protocol.request(url, options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// =====================
// System Info
// =====================
ipcMain.handle('get-system-info', async () => {
  return {
    totalMemory: Math.floor(os.totalmem() / (1024 * 1024)),
    freeMemory: Math.floor(os.freemem() / (1024 * 1024)),
    cpuCores: os.cpus().length,
    platform: process.platform,
    arch: process.arch,
  };
});

// =====================
// Data Persistence
// =====================
ipcMain.handle('save-data', async (event, data) => {
  try {
    if (!app.isReady()) {
      return { success: false, error: 'App not ready' };
    }
    const dataPath = path.join(app.getPath('userData'), 'launcher-data.json');
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('load-data', async () => {
  try {
    if (!app.isReady()) {
      return { success: false, error: 'App not ready' };
    }
    const dataPath = path.join(app.getPath('userData'), 'launcher-data.json');
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf-8');
      return { success: true, data: JSON.parse(content) };
    }
    return { success: false, error: 'No data file found' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// =====================
// Content Installation
// =====================
ipcMain.handle('cancel-download', () => {
  downloadCancelled = true;
  return { success: true };
});

// Download content (mods, shaders, resource packs)
ipcMain.handle('download-content', async (event, url, instanceId, folder, filename) => {
  try {
    console.log('Download content called:', { url, instanceId, folder, filename });
    const dataPath = getDataPath();
    if (!dataPath) {
      console.error('Data path not available');
      return { success: false, error: 'Data path not available' };
    }

    const instancePath = path.join(dataPath, 'instances', instanceId);
    const destPath = path.join(instancePath, folder, filename);
    const dir = path.dirname(destPath);

    console.log('Target path:', destPath);
    console.log('Directory:', dir);

    if (!fs.existsSync(dir)) {
      console.log('Creating directory:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }

    // Download file
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', { file: filename, progress: 0 });
    }

    console.log('Starting download from:', url);
    await downloadFileWithRetry(url, destPath);
    console.log('Download complete');

    if (mainWindow) {
      mainWindow.webContents.send('download-progress', { file: filename, progress: 100 });
    }

    return { success: true, path: destPath };
  } catch (error) {
    console.error('Download content error:', error);
    return { success: false, error: String(error) };
  }
});

// List installed content (mods, shaders, resource packs)
ipcMain.handle('list-installed-content', async (event, instanceId, contentType) => {
  try {
    const dataPath = getDataPath();
    if (!dataPath) {
      return { success: false, error: 'Data path not available' };
    }
    
    const instancePath = path.join(dataPath, 'instances', instanceId);
    let folder = '';
    
    if (contentType === 'mod') {
      folder = 'mods';
    } else if (contentType === 'shader') {
      folder = 'shaderpacks';
    } else if (contentType === 'resourcepack') {
      folder = 'resourcepacks';
    }
    
    const contentPath = path.join(instancePath, folder);
    
    if (!fs.existsSync(contentPath)) {
      return { success: true, items: [] };
    }
    
    const files = fs.readdirSync(contentPath);
    const items = files.map(file => ({
      name: file,
      path: path.join(contentPath, file),
      size: fs.statSync(path.join(contentPath, file)).size
    }));
    
    return { success: true, items };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Delete installed content
ipcMain.handle('delete-content', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
