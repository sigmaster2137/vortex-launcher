import { memo, useState, useCallback } from 'react';
import { Cpu, Info, HardDrive, Check, Download, Loader2 } from 'lucide-react';
import type { LauncherSettings } from '../types/launcher';

interface SettingsViewProps {
  settings: LauncherSettings;
  onUpdate: (settings: Partial<LauncherSettings>) => void;
  javaRuntimes?: Array<{ path: string; name: string; version: string }>;
  systemInfo?: {
    totalMemory: number;
    freeMemory: number;
    cpuCores: number;
    platform: string;
    arch: string;
  } | null;
  onDownloadJava?: (version: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

const memoryPresets = [
  { label: '2 GB', value: 2048 },
  { label: '4 GB', value: 4096 },
  { label: '6 GB', value: 6144 },
  { label: '8 GB', value: 8192 },
  { label: '12 GB', value: 12288 },
  { label: '16 GB', value: 16384 },
];

export const SettingsView = memo(function SettingsView({
  settings,
  onUpdate,
  javaRuntimes = [],
  systemInfo,
  onDownloadJava,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<'java' | 'about'>('java');
  const [downloadingJava, setDownloadingJava] = useState(false);
  const [javaVersion, setJavaVersion] = useState('17');
  const [customMemory, setCustomMemory] = useState('');
  const [showCustomMemory, setShowCustomMemory] = useState(false);

  const handleDownloadJava = useCallback(async () => {
    if (!onDownloadJava || downloadingJava) return;
    setDownloadingJava(true);
    try {
      await onDownloadJava(javaVersion);
    } finally {
      setDownloadingJava(false);
    }
  }, [onDownloadJava, downloadingJava, javaVersion]);

  const handleMemoryPreset = useCallback((value: number) => {
    onUpdate({ memory: value });
    setCustomMemory('');
    setShowCustomMemory(false);
  }, [onUpdate]);

  const handleCustomMemorySubmit = useCallback(() => {
    const value = parseInt(customMemory);
    if (!isNaN(value) && value >= 512 && value <= 65536) {
      onUpdate({ memory: value });
      setCustomMemory('');
      setShowCustomMemory(false);
    }
  }, [customMemory, onUpdate]);

  const isElectronApp = typeof window !== 'undefined' && window.electron;
  const currentMemoryGB = (settings.memory / 1024).toFixed(1);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/10 shrink-0">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-gray-500 text-sm mt-1">Configure your launcher preferences</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-56 bg-[#16162a] border-r border-white/10 p-3 shrink-0">
          <div className="space-y-1">
            <button
              onClick={() => setActiveSection('java')}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${
                activeSection === 'java'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Cpu size={18} />
              <span className="font-medium">Java</span>
            </button>
            <button
              onClick={() => setActiveSection('about')}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${
                activeSection === 'about'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Info size={18} />
              <span className="font-medium">About</span>
            </button>
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === 'java' && (
            <section className="max-w-2xl space-y-6">
              {/* Memory Allocation */}
              <div className="bg-[#1e1e32] rounded-2xl p-6 border border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <Cpu size={20} className="text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">Memory Allocation</h3>
                </div>

                <p className="text-gray-400 text-sm mb-4">
                  Allocate RAM for Minecraft. More memory helps with modpacks. Recommended: 4-8 GB.
                </p>

                <div className="grid grid-cols-6 gap-2 mb-4">
                  {memoryPresets.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => handleMemoryPreset(preset.value)}
                      className={`py-3 rounded-xl text-sm font-medium transition-all ${
                        settings.memory === preset.value
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#12121f] text-gray-400 hover:bg-[#1a1a2e] hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom Memory Input */}
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => setShowCustomMemory(!showCustomMemory)}
                    className="text-emerald-400 text-sm hover:underline"
                  >
                    {showCustomMemory ? 'Use presets' : 'Custom amount'}
                  </button>
                </div>

                {showCustomMemory && (
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={customMemory}
                      onChange={e => setCustomMemory(e.target.value)}
                      placeholder="Memory in MB (e.g., 6144 for 6 GB)"
                      min={512}
                      max={65536}
                      className="flex-1 px-4 py-3 bg-[#12121f] text-white rounded-xl border border-white/10 focus:border-emerald-500/50 outline-none transition-colors"
                      onKeyDown={e => e.key === 'Enter' && handleCustomMemorySubmit()}
                    />
                    <button
                      onClick={handleCustomMemorySubmit}
                      className="px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between mt-4">
                  <span className="text-gray-500 text-sm">
                    Current: <span className="text-emerald-400 font-medium">{currentMemoryGB} GB</span>
                  </span>
                  {systemInfo && (
                    <span className="text-gray-500 text-sm">
                      System: <span className="text-white">{(systemInfo.totalMemory / 1024).toFixed(0)} GB</span> available
                    </span>
                  )}
                </div>
              </div>

              {/* Java Runtime */}
              {isElectronApp && (
                <div className="bg-[#1e1e32] rounded-2xl p-6 border border-white/5">
                  <div className="flex items-center gap-3 mb-4">
                    <HardDrive size={20} className="text-emerald-400" />
                    <h3 className="text-lg font-semibold text-white">Java Runtime</h3>
                  </div>

                  <p className="text-gray-400 text-sm mb-4">
                    Minecraft requires Java 17 or newer. Select an installed version or download one.
                  </p>

                  {javaRuntimes.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <p className="text-gray-500 text-sm">Detected Installations:</p>
                      {javaRuntimes.map(java => (
                        <button
                          key={java.path}
                          onClick={() => {
                            onUpdate({ javaPath: java.path });
                          }}
                          className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
                            settings.javaPath === java.path
                              ? 'bg-emerald-500/20 border border-emerald-500/40'
                              : 'bg-[#12121f] border border-transparent hover:border-white/10'
                          }`}
                        >
                          <div className="flex-1">
                            <p className="text-white font-medium">{java.name}</p>
                            <p className="text-gray-500 text-xs font-mono truncate">{java.path}</p>
                          </div>
                          {settings.javaPath === java.path && (
                            <Check size={18} className="text-emerald-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {onDownloadJava && (
                    <div className="flex gap-3 mt-4">
                      <select
                        value={javaVersion}
                        onChange={e => setJavaVersion(e.target.value)}
                        className="px-4 py-2.5 bg-[#12121f] text-white rounded-xl border border-white/10 outline-none"
                      >
                        <option value="17">Java 17 (Recommended)</option>
                        <option value="21">Java 21 (Latest)</option>
                      </select>
                      <button
                        onClick={handleDownloadJava}
                        disabled={downloadingJava}
                        className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 disabled:from-gray-500 disabled:to-gray-600 text-white rounded-xl font-medium flex items-center gap-2 transition-all disabled:cursor-not-allowed"
                      >
                        {downloadingJava ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download size={16} />
                            Download Java
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!isElectronApp && (
                <div className="bg-[#1e1e32] rounded-2xl p-6 border border-white/5">
                  <div className="flex items-center gap-3 mb-4">
                    <HardDrive size={20} className="text-cyan-400" />
                    <h3 className="text-lg font-semibold text-white">Java Runtime</h3>
                  </div>
                  <p className="text-gray-400 text-sm mb-4">
                    Java settings are available in the desktop app.
                  </p>
                  <p className="text-gray-500 text-sm">
                    Run <code className="px-2 py-0.5 bg-[#12121f] rounded text-cyan-400">./build.sh</code> or <code className="px-2 py-0.5 bg-[#12121f] rounded text-cyan-400">build.bat</code> to create the desktop app.
                  </p>
                </div>
              )}

              {/* JVM Arguments */}
              <div className="bg-[#1e1e32] rounded-2xl p-6 border border-white/5">
                <h3 className="text-lg font-semibold text-white mb-4">JVM Arguments</h3>
                <p className="text-gray-400 text-sm mb-3">
                  Advanced: Custom arguments for Java. Leave default unless you know what you're doing.
                </p>
                <textarea
                  value={settings.javaArgs}
                  onChange={e => onUpdate({ javaArgs: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-[#12121f] text-white rounded-xl border border-white/10 focus:border-emerald-500/50 outline-none transition-colors font-mono text-sm resize-none"
                />
              </div>
            </section>
          )}

          {activeSection === 'about' && (
            <section className="max-w-2xl space-y-6">
              <div className="bg-[#1e1e32] rounded-2xl p-8 border border-white/5 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <span className="text-4xl text-white font-bold">V</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-1">Vortex Launcher</h3>
                <p className="text-gray-500 mb-4">Version 1.0.0</p>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                  A modern Minecraft launcher. Browse and install mods, shaders, and resource packs from Modrinth.
                </p>
              </div>

              {systemInfo && (
                <div className="bg-[#1e1e32] rounded-2xl p-6 border border-white/5">
                  <h3 className="text-lg font-semibold text-white mb-4">System Info</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Platform</span>
                      <span className="text-gray-300">{systemInfo.platform} ({systemInfo.arch})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">CPU Cores</span>
                      <span className="text-gray-300">{systemInfo.cpuCores}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Memory</span>
                      <span className="text-gray-300">{(systemInfo.totalMemory / 1024).toFixed(0)} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Free Memory</span>
                      <span className="text-gray-300">{(systemInfo.freeMemory / 1024).toFixed(1)} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Java Detection</span>
                      <span className="text-gray-300">{javaRuntimes.length} installation(s)</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
});
