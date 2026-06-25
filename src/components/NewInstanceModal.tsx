import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { X, Plus, Loader2, Download, AlertCircle } from 'lucide-react';

interface MinecraftVersion {
  id: string;
  type: 'release' | 'snapshot';
  url: string;
}

interface NewInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, version: string, modloader: string) => void;
}

const modloaders = [
  { id: 'vanilla', name: 'Vanilla', description: 'No modifications', recommendedVersion: null },
  { id: 'fabric', name: 'Fabric', description: 'Lightweight mod loader', recommendedVersion: '1.21.1' },
  { id: 'forge', name: 'Forge', description: 'Classic mod loader', recommendedVersion: '1.20.1' },
  { id: 'quilt', name: 'Quilt', description: 'Fabric fork', recommendedVersion: '1.21.1' },
];

// Supported versions for each loader
const loaderVersions: Record<string, string[]> = {
  vanilla: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.8.9'],
  fabric: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5'],
  forge: ['1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.8.9'],
  quilt: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2'],
};

async function fetchMinecraftVersions(): Promise<MinecraftVersion[]> {
  try {
    const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    const data = await response.json();
    return data.versions.slice(0, 100).map((v: { id: string; type: string; url: string }) => ({
      id: v.id,
      type: v.type as 'release' | 'snapshot',
      url: v.url,
    }));
  } catch {
    return [
      { id: '1.21.1', type: 'release', url: '' },
      { id: '1.21', type: 'release', url: '' },
      { id: '1.20.6', type: 'release', url: '' },
      { id: '1.20.4', type: 'release', url: '' },
      { id: '1.20.1', type: 'release', url: '' },
      { id: '1.19.4', type: 'release', url: '' },
      { id: '1.19.2', type: 'release', url: '' },
      { id: '1.18.2', type: 'release', url: '' },
      { id: '1.16.5', type: 'release', url: '' },
      { id: '1.12.2', type: 'release', url: '' },
      { id: '1.8.9', type: 'release', url: '' },
    ];
  }
}

export const NewInstanceModal = memo(function NewInstanceModal({ isOpen, onClose, onCreate }: NewInstanceModalProps) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.21.1');
  const [modloader, setModloader] = useState('vanilla');
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get available versions for current loader
  const availableVersions = loaderVersions[modloader] || loaderVersions.vanilla;

  useEffect(() => {
    if (isOpen) {
      setLoadingVersions(true);
      fetchMinecraftVersions()
        .then(vers => {
          setVersions(vers);
        })
        .finally(() => setLoadingVersions(false));

      // Set recommended version for loader
      const loader = modloaders.find(l => l.id === modloader);
      if (loader?.recommendedVersion && availableVersions.includes(loader.recommendedVersion)) {
        setVersion(loader.recommendedVersion);
      } else if (availableVersions.length > 0) {
        setVersion(availableVersions[0]);
      }

      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Update version when loader changes
  useEffect(() => {
    const loader = modloaders.find(l => l.id === modloader);
    if (loader?.recommendedVersion && availableVersions.includes(loader.recommendedVersion)) {
      setVersion(loader.recommendedVersion);
    } else if (availableVersions.length > 0 && !availableVersions.includes(version)) {
      setVersion(availableVersions[0]);
    }
  }, [modloader, availableVersions, version]);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 300));
    onCreate(name, version, modloader);
    setLoading(false);
    onClose();
    setName('');
  }, [name, version, modloader, onCreate, onClose]);

  const suggestedName = modloader === 'vanilla'
    ? `Minecraft ${version}`
    : `${modloader.charAt(0).toUpperCase() + modloader.slice(1)} ${version}`;

  const currentLoader = modloaders.find(l => l.id === modloader);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[#1a1a2e] rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Create New Instance</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Instance Name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={suggestedName}
              className="w-full px-4 py-3 bg-[#12121f] text-white rounded-xl border border-white/10 focus:border-emerald-500/50 outline-none transition-colors"
            />
            {!name && (
              <button
                onClick={() => setName(suggestedName)}
                className="text-emerald-400 text-sm mt-2 hover:underline"
              >
                Use "{suggestedName}"
              </button>
            )}
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-2">Mod Loader</label>
            <div className="grid grid-cols-2 gap-2">
              {modloaders.map(loader => (
                <button
                  key={loader.id}
                  onClick={() => setModloader(loader.id)}
                  className={`p-3 rounded-xl text-left transition-all relative ${
                    modloader === loader.id
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : 'bg-[#12121f] text-gray-400 border border-white/10 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <p className="font-medium">{loader.name}</p>
                  <p className="text-xs opacity-70">{loader.description}</p>
                  {loader.recommendedVersion && (
                    <p className="text-xs text-cyan-400 mt-1">
                      Best: {loader.recommendedVersion}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-sm">Minecraft Version</label>
              {currentLoader?.recommendedVersion && (
                <span className="text-xs text-emerald-400">
                  Recommended: {currentLoader.recommendedVersion}
                </span>
              )}
            </div>

            {modloader !== 'vanilla' && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <AlertCircle size={14} className="text-cyan-400 shrink-0" />
                <p className="text-cyan-400 text-xs">
                  {modloader === 'forge'
                    ? 'Forge works best with 1.20.1 (latest stable)'
                    : `${modloader.charAt(0).toUpperCase() + modloader.slice(1)} is fully supported on 1.21.1`}
                </p>
              </div>
            )}

            <select
              value={version}
              onChange={e => setVersion(e.target.value)}
              disabled={loadingVersions}
              className="w-full px-4 py-3 bg-[#12121f] text-white rounded-xl border border-white/10 focus:border-emerald-500/50 outline-none transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingVersions ? (
                <option>Loading versions...</option>
              ) : (
                <>
                  <optgroup label={`${modloader.charAt(0).toUpperCase() + modloader.slice(1)} Supported`}>
                    {availableVersions.map(v => {
                      const isRec = v === currentLoader?.recommendedVersion;
                      return (
                        <option key={v} value={v}>
                          {v} {isRec ? '(Recommended)' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                  {modloader === 'vanilla' && showSnapshots && versions.filter(v => v.type === 'snapshot').length > 0 && (
                    <optgroup label="Snapshots">
                      {versions.filter(v => v.type === 'snapshot').slice(0, 10).map(v => (
                        <option key={v.id} value={v.id}>{v.id}</option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
            {modloader === 'vanilla' && (
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={showSnapshots}
                  onChange={e => setShowSnapshots(e.target.checked)}
                  className="w-4 h-4 rounded bg-[#12121f] border-white/20 text-emerald-500 focus:ring-emerald-500/50"
                />
                Include Snapshots
              </label>
            )}
          </div>

          <div className="p-4 bg-[#12121f] rounded-xl border border-emerald-500/20">
            <div className="flex items-start gap-3">
              <Download size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-white text-sm font-medium">
                  {name || suggestedName}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  {modloader === 'vanilla'
                    ? 'Vanilla Minecraft, no mods'
                    : `${modloader.charAt(0).toUpperCase() + modloader.slice(1)} mod loader for mods`}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-gray-400 hover:text-white rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:from-gray-500 disabled:to-gray-600 text-white rounded-xl font-medium flex items-center gap-2 transition-all disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus size={18} />
                Create Instance
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
