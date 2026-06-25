import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { Play, Zap, ChevronRight, User } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { InstancesView } from './components/InstancesView';
import { ContentBrowser } from './components/ContentBrowser';
import { AccountsView } from './components/AccountsView';
import { SettingsView } from './components/SettingsView';
import { LaunchProgress } from './components/LaunchProgress';
import { ToastProvider, useToast } from './components/Toast';
import { TitleBar } from './components/TitleBar';
import { useView, useFpsCounter, useElectronLauncher } from './hooks/useElectron';
import type { MinecraftInstance, MinecraftAccount, LauncherSettings } from './types/launcher';

const defaultSettings: LauncherSettings = {
  javaPath: '',
  javaArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled',
  memory: 4096,
  width: 1920,
  height: 1080,
  fullscreen: false,
  background: 'default',
};

const STORAGE_KEY = 'vortex_launcher_data';

interface LauncherData {
  instances: MinecraftInstance[];
  accounts: MinecraftAccount[];
  settings: LauncherSettings;
  selectedAccountId: string;
  selectedInstanceId: string;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.trunc(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function AppContent() {
  const { view, toggleView } = useView();
  const fps = useFpsCounter();
  const { showToast } = useToast();

  const {
    javaRuntimes,
    systemInfo,
    launchState,
    setLaunchState,
    launch,
    downloadJava,
    isElectron: runningInElectron,
  } = useElectronLauncher();

  // State
  const [instances, setInstances] = useState<MinecraftInstance[]>([]);
  const [accounts, setAccounts] = useState<MinecraftAccount[]>([]);
  const [settings, setSettings] = useState<LauncherSettings>(defaultSettings);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const data: LauncherData = JSON.parse(stored);
          setAccounts(data.accounts || []);
          setSettings({ ...defaultSettings, ...(data.settings || {}) });
          setSelectedAccountId(data.selectedAccountId || '');
          setSelectedInstanceId(data.selectedInstanceId || '');

          // In Electron, load instances from file system ONLY
          if (runningInElectron && window.electron) {
            const electronInstances = await window.electron.listInstances();
            setInstances(electronInstances.map(i => ({
              ...i,
              modloader: (i.modloader || 'vanilla') as MinecraftInstance['modloader']
            })));
          } else {
            // Browser mode: use localStorage instances
            setInstances(data.instances || []);
          }
        } else if (runningInElectron && window.electron) {
          // No localStorage data but in Electron - load from file system
          const electronInstances = await window.electron.listInstances();
          setInstances(electronInstances.map(i => ({
            ...i,
            modloader: (i.modloader || 'vanilla') as MinecraftInstance['modloader']
          })));
        }
      } catch {
        // Ignore parse errors
      }
    };
    loadData();
  }, [runningInElectron]);

  // Save data on changes
  const saveTimeoutRef = useRef<number>();
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      const data: LauncherData = {
        instances: runningInElectron ? [] : instances, // Don't save instances in Electron mode
        accounts,
        settings,
        selectedAccountId,
        selectedInstanceId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, 200);
  }, [instances, accounts, settings, selectedAccountId, selectedInstanceId, runningInElectron]);

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const selectedInstance = useMemo(
    () => instances.find(i => i.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  // Instance handlers
  const handleCreateInstance = useCallback(async (name: string, version: string, modloader: string) => {
    if (runningInElectron && window.electron) {
      setLaunchState({ phase: 'downloading', progress: 0, message: 'Creating instance and downloading Minecraft files...' });
      try {
        const result = await window.electron.createInstance({ name, version, modloader });
        if (result.success) {
          setLaunchState({ phase: 'idle', progress: 0, message: '' });
          const electronInstances = await window.electron.listInstances();
          setInstances(electronInstances.map(i => ({
            ...i,
            modloader: (i.modloader || 'vanilla') as MinecraftInstance['modloader']
          })));
          setSelectedInstanceId(result.id || '');
          showToast('success', `Created ${name}`);
        } else {
          setLaunchState({ phase: 'error', progress: 0, message: result.error || 'Failed to create instance' });
          showToast('error', result.error || 'Failed to create instance');
        }
      } catch (error) {
        setLaunchState({ phase: 'error', progress: 0, message: String(error) });
        showToast('error', String(error));
      }
    } else {
      const newInstance: MinecraftInstance = {
        id: generateUUID(),
        name,
        version,
        modloader: modloader as MinecraftInstance['modloader'],
        icon: modloader === 'fabric' ? 'fabric' : modloader === 'forge' ? 'anvil' : 'grass_block',
        lastPlayed: new Date().toISOString().split('T')[0],
        playTime: 0,
      };
      setInstances(prev => [newInstance, ...prev]);
      setSelectedInstanceId(newInstance.id);
      showToast('success', `Created ${name}`);
    }
  }, [showToast, runningInElectron]);

  const handleDeleteInstance = useCallback(async (id: string) => {
    const instance = instances.find(i => i.id === id);
    
    if (runningInElectron && window.electron) {
      await window.electron.deleteInstance(id);
    }
    
    setInstances(prev => prev.filter(i => i.id !== id));
    if (selectedInstanceId === id) {
      setSelectedInstanceId(instances.find(i => i.id !== id)?.id || '');
    }
    if (instance) {
      showToast('success', `Deleted ${instance.name}`);
    }
  }, [selectedInstanceId, instances, showToast, runningInElectron]);

  const handleOpenFolder = useCallback((id: string) => {
    if (runningInElectron && window.electron) {
      const instance = instances.find(i => i.id === id);
      if (instance && 'path' in instance) {
        window.electron.openFolder((instance as any).path);
      } else {
        window.electron.openFolder();
      }
    } else {
      showToast('info', 'Open the Electron app to access instance folders');
    }
  }, [runningInElectron, showToast, instances]);

  const handleUpdateInstance = useCallback((id: string, updates: Partial<MinecraftInstance>) => {
    setInstances(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    showToast('success', 'Instance updated');
  }, [showToast]);

  const handlePlay = useCallback(async (instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;

    if (!runningInElectron) {
      showToast('info', 'Build and run the Electron app to launch Minecraft');
      return;
    }

    if (!selectedAccount) {
      showToast('error', 'Select an account first');
      return;
    }

    await launch(instance, settings, selectedAccount.username);
  }, [instances, settings, selectedAccount, launch, showToast, runningInElectron]);

  // Account handlers
  const handleAddOffline = useCallback(async (username: string) => {
    const newAccount: MinecraftAccount = {
      id: generateUUID(),
      username,
      uuid: generateUUID(),
      avatar: `https://mc-heads.net/avatar/${encodeURIComponent(username)}`,
      type: 'offline',
    };
    
    if (runningInElectron && window.electron) {
      await window.electron.saveData({ accounts: [...accounts, newAccount] });
      const data = await window.electron.loadData();
      if (data.success && data.data) {
        const saved = data.data as LauncherData;
        setAccounts(saved.accounts || []);
      }
    } else {
      setAccounts(prev => [...prev, newAccount]);
    }
    
    setSelectedAccountId(newAccount.id);
    showToast('success', `Added ${username}`);
  }, [accounts, runningInElectron, showToast]);

  const handleRemoveAccount = useCallback(async (id: string) => {
    const account = accounts.find(a => a.id === id);
    
    if (runningInElectron && window.electron) {
      await window.electron.saveData({ accounts: accounts.filter(a => a.id !== id) });
      const data = await window.electron.loadData();
      if (data.success && data.data) {
        const saved = data.data as LauncherData;
        setAccounts(saved.accounts || []);
      }
    } else {
      setAccounts(prev => prev.filter(a => a.id !== id));
    }
    
    if (selectedAccountId === id) {
      setSelectedAccountId(accounts.find(a => a.id !== id)?.id || '');
    }
    if (account) {
      showToast('success', `Removed ${account.username}`);
    }
  }, [selectedAccountId, accounts, runningInElectron, showToast]);

  const updateSettings = useCallback((newSettings: Partial<LauncherSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const selectInstance = useCallback((id: string) => {
    setSelectedInstanceId(id);
  }, []);

  // Header content
  const headerContent = useMemo(() => {
    const account = selectedAccount;
    const instance = selectedInstance;

    if (!account) {
      return (
        <div className="flex items-center gap-4 w-full">
          <div className="w-12 h-12 rounded-xl bg-[#1e1e32] flex items-center justify-center">
            <User size={24} className="text-gray-500" />
          </div>
          <div className="flex flex-col">
            <p className="text-gray-400 font-medium">No account selected</p>
            <p className="text-gray-500 text-sm">Add an account to play</p>
          </div>
          <button
            onClick={() => toggleView('accounts')}
            className="ml-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium transition-colors"
          >
            Add Account
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-4 w-full">
        <img
          src={account.avatar}
          alt=""
          className="w-12 h-12 rounded-xl ring-2 ring-white/10"
          onError={e => { (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve'; }}
        />
        <div className="flex flex-col">
          <p className="text-white font-semibold text-lg">{account.username}</p>
          <p className="flex items-center gap-1.5 text-gray-400 text-sm">
            {instance ? (
              <>
                <span className="text-emerald-400 font-medium">{instance.name}</span>
                <ChevronRight size={14} className="text-gray-600" />
                <span>{instance.version}</span>
              </>
            ) : (
              <span className="text-gray-500">Select an instance</span>
            )}
          </p>
        </div>

        <button
          onClick={() => instance && handlePlay(instance.id)}
          disabled={!instance}
          className={`ml-auto px-8 py-3 rounded-xl font-bold flex items-center gap-3 transition-all duration-150 ${
            runningInElectron && instance
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white hover:scale-105'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Play size={22} fill="currentColor" />
          {runningInElectron ? 'Launch Game' : 'Build to Launch'}
          {runningInElectron && <Zap size={18} className="text-white/80" />}
        </button>
      </div>
    );
  }, [selectedAccount, selectedInstance, handlePlay, toggleView, runningInElectron]);

  const viewContent = useMemo(() => {
    switch (view) {
      case 'instances':
        return (
          <InstancesView
            instances={instances}
            selectedId={selectedInstanceId}
            onSelect={selectInstance}
            onPlay={handlePlay}
            onDelete={handleDeleteInstance}
            onUpdate={handleUpdateInstance}
            onCreateInstance={handleCreateInstance}
            onOpenFolder={handleOpenFolder}
            onNavigate={toggleView}
          />
        );
      case 'browse':
        return (
          <ContentBrowser
            selectedInstance={selectedInstance}
            onInstall={async (item, version, dependencies) => {
              console.log('onInstall called:', { item, version, dependencies, runningInElectron, selectedInstance });
              console.log('Version files:', version.files);
              
              if (!version.files || version.files.length === 0) {
                console.error('No files found in version');
                showToast('error', 'No file available for download');
                return;
              }
              
              const file = version.files[0];
              console.log('File:', file);
              
              if (!file) {
                console.error('First file is null/undefined');
                showToast('error', 'No file available for download');
                return;
              }
              
              if (!file.url) {
                console.error('File has no URL:', file);
                showToast('error', 'File has no download URL');
                return;
              }
              
              if (!file.filename) {
                console.error('File has no filename:', file);
                showToast('error', 'File has no filename');
                return;
              }
              
              if (!runningInElectron) {
                console.log('Not running in Electron, opening in browser');
                window.open(file.url, '_blank');
                return;
              }
              
              if (!window.electron) {
                console.error('window.electron not available');
                showToast('error', 'Electron API not available');
                return;
              }
              
              if (!selectedInstance) {
                console.error('No instance selected');
                showToast('error', 'Please select an instance first');
                return;
              }
              
              const depCount = dependencies.length;
              showToast('success', `Downloading ${item.name}${depCount > 0 ? ` (+ ${depCount} dependencies)` : ''}...`);
              
              // Download to correct folder based on content type
              let folder = '';
              if (item.projectType === 'mod') {
                folder = 'mods';
              } else if (item.projectType === 'shader') {
                folder = 'shaderpacks';
              } else if (item.projectType === 'resourcepack') {
                folder = 'resourcepacks';
              }
              
              console.log('Folder:', folder);
              
              if (folder) {
                try {
                  console.log('Downloading:', file.url, 'to instance:', selectedInstance.id, 'folder:', folder, 'filename:', file.filename);
                  const result = await window.electron.downloadContent(file.url, selectedInstance.id, folder, file.filename);
                  console.log('Download result:', result);
                  if (!result.success) {
                    showToast('error', result.error || 'Download failed');
                  } else {
                    showToast('success', `Downloaded ${item.name}`);
                    // Close download progress menu only
                    setLaunchState({ phase: 'idle', progress: 0, message: '' });
                  }
                } catch (error) {
                  console.error('Download error:', error);
                  showToast('error', String(error));
                }
              } else {
                console.error('Could not determine folder for projectType:', item.projectType);
                showToast('error', 'Unknown content type');
              }
            }}
          />
        );
      case 'accounts':
        return (
          <AccountsView
            accounts={accounts}
            selectedId={selectedAccountId}
            onSelect={setSelectedAccountId}
            onAddOffline={handleAddOffline}
            onRemove={handleRemoveAccount}
          />
        );
      case 'settings':
        return (
          <SettingsView
            settings={settings}
            onUpdate={updateSettings}
            javaRuntimes={javaRuntimes}
            systemInfo={systemInfo}
            onDownloadJava={downloadJava}
          />
        );
    }
  }, [view, instances, selectedInstanceId, selectInstance, handlePlay, handleDeleteInstance, handleUpdateInstance, handleCreateInstance, handleOpenFolder, toggleView, selectedInstance, accounts, selectedAccountId, handleAddOffline, handleRemoveAccount, settings, updateSettings, javaRuntimes, systemInfo, downloadJava, showToast]);

  const backgroundStyle = useMemo(() => {
    const bg = settings.background || 'default';
    const backgrounds: Record<string, { type: 'color' | 'image'; value: string }> = {
      default: { type: 'color', value: '#12121f' },
      classic: { type: 'image', value: 'https://minecraft.wiki/images/Panorama_1.20.1.png' },
      nether: { type: 'image', value: 'https://minecraft.wiki/images/Nether_Panorama.png' },
      end: { type: 'image', value: 'https://minecraft.wiki/images/End_Panorama.png' },
      sunny: { type: 'image', value: 'https://minecraft.wiki/images/Sunny_Panorama.png' },
      forest: { type: 'image', value: 'https://minecraft.wiki/images/Forest_Panorama.png' },
    };
    return backgrounds[bg] || backgrounds.default;
  }, [settings.background]);

  return (
    <div 
      className="h-screen w-screen flex flex-col select-none overflow-hidden" 
      style={{ 
        contain: 'strict',
        backgroundColor: backgroundStyle.type === 'color' ? backgroundStyle.value : undefined,
        backgroundImage: backgroundStyle.type === 'image' ? `url(${backgroundStyle.value})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar view={view} onViewChange={toggleView} fps={fps} />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-20 bg-black/40 backdrop-blur-md border-b border-white/10 px-6 flex items-center shrink-0">
            {headerContent}
          </header>
          <div className="flex-1 overflow-hidden relative" style={{ contain: 'content' }}>
            {viewContent}
          </div>
        </main>
      </div>

      <LaunchProgress
        status={launchState.phase}
        progress={launchState.progress}
        message={launchState.message}
        onClose={() => setLaunchState({ phase: 'idle', progress: 0, message: '' })}
        onAbort={launchState.phase === 'downloading' ? () => {
          if (window.electron) {
            window.electron.cancelDownload?.();
          }
          setLaunchState({ phase: 'idle', progress: 0, message: '' });
        } : undefined}
      />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
