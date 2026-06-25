import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Clock, Play, Folder, Image, MoreVertical, Trash2, Edit2, ExternalLink, X } from 'lucide-react';
import type { MinecraftInstance } from '../types/launcher';

interface InstanceCardProps {
  instance: MinecraftInstance;
  selected: boolean;
  onSelect: (id: string) => void;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onUpdate: (id: string, updates: Partial<MinecraftInstance>) => void;
  onBrowseContent: (type: 'mods' | 'shaderpacks' | 'resourcepacks') => void;
  contentCounts?: { mods: number; shaders: number; resourcepacks: number };
}

const modloaderColors: Record<string, string> = {
  vanilla: 'text-amber-400',
  fabric: 'text-indigo-400',
  forge: 'text-orange-400',
  quilt: 'text-pink-400',
};

const instanceIcons: Record<string, string> = {
  grass_block: '🌿',
  fabric: '🧵',
  anvil: '🔨',
  default: '🎮',
};

function formatPlayTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
}

const EditModal = memo(function EditModal({
  instance,
  onClose,
  onSave,
}: {
  instance: MinecraftInstance;
  onClose: () => void;
  onSave: (updates: Partial<MinecraftInstance>) => void;
}) {
  const [name, setName] = useState(instance.name);

  const handleSave = useCallback(() => {
    if (name.trim()) {
      onSave({ name: name.trim() });
      onClose();
    }
  }, [name, onSave, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-2xl p-6 max-w-md w-full shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Edit Instance</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">Instance Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[#12121f] text-white rounded-xl border border-white/10 focus:border-emerald-500/50 outline-none"
            />
          </div>

          <div className="p-3 bg-[#12121f] rounded-xl">
            <p className="text-gray-400 text-sm">
              Version: <span className="text-white">{instance.version}</span>
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Loader: <span className="text-white capitalize">{instance.modloader}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-gray-400 hover:text-white rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-white rounded-xl font-medium transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
});

const DetailsModal = memo(function DetailsModal({
  instance,
  contentCounts,
  onClose,
}: {
  instance: MinecraftInstance;
  contentCounts?: { mods: number; shaders: number; resourcepacks: number };
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'mods' | 'shaders' | 'packs'>('mods');
  const [items, setItems] = useState<Array<{ name: string; path: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    const loadItems = async () => {
      if (!window.electron) return;
      setLoading(true);
      try {
        const type = activeTab === 'mods' ? 'mod' : activeTab === 'shaders' ? 'shader' : 'resourcepack';
        const result = await window.electron.listInstalledContent(instance.id, type);
        if (mounted) {
          if (result.success && result.items) {
            setItems(result.items);
          } else {
            setItems([]);
          }
        }
      } catch (error) {
        console.error('Failed to load items:', error);
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadItems();
    return () => { mounted = false; };
  }, [instance.id, activeTab]);

  const handleDelete = async (path: string) => {
    if (!window.confirm('Delete this item?')) return;
    if (!window.electron) return;
    try {
      await window.electron.deleteContent(path);
      setItems(prev => prev.filter(i => i.path !== path));
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-white/10 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="text-lg font-bold text-white">{instance.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 shrink-0">
          <div className="p-3 bg-[#12121f] rounded-xl">
            <p className="text-gray-400 text-sm">
              Version: <span className="text-white">{instance.version}</span>
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Loader: <span className="text-white capitalize">{instance.modloader}</span>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('mods')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'mods' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#12121f] text-gray-400 hover:text-white'
              }`}
            >
              Mods ({contentCounts?.mods || 0})
            </button>
            <button
              onClick={() => setActiveTab('shaders')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'shaders' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#12121f] text-gray-400 hover:text-white'
              }`}
            >
              Shaders ({contentCounts?.shaders || 0})
            </button>
            <button
              onClick={() => setActiveTab('packs')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'packs' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#12121f] text-gray-400 hover:text-white'
              }`}
            >
              Packs ({contentCounts?.resourcepacks || 0})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mt-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No {activeTab} installed</div>
          ) : (
            items.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-[#12121f] rounded-lg">
                <span className="text-white text-sm truncate flex-1">{item.name}</span>
                <button
                  onClick={() => handleDelete(item.path)}
                  className="ml-2 p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 mt-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

const ScreenshotsModal = memo(function ScreenshotsModal({
  instanceId,
  onClose,
}: {
  instanceId: string;
  onClose: () => void;
}) {
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadScreenshots = async () => {
      if (window.electron) {
        try {
          // In Electron, this would load actual screenshots
          setScreenshots([]);
        } catch {}
      }
      setLoading(false);
    };
    loadScreenshots();
  }, [instanceId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-white/10 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Screenshots</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : screenshots.length === 0 ? (
            <div className="text-center py-12">
              <Image size={48} className="mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400">No screenshots found</p>
              <p className="text-gray-500 text-sm mt-1">Take screenshots in-game with F2</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {screenshots.map((src, i) => (
                <img key={i} src={src} alt="" className="rounded-lg w-full aspect-video object-cover" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const InstanceCard = memo(function InstanceCard({
  instance,
  selected,
  onSelect,
  onPlay,
  onDelete,
  onOpenFolder,
  onUpdate,
  onBrowseContent,
  contentCounts,
}: InstanceCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showScreenshots, setShowScreenshots] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isElectronApp = typeof window !== 'undefined' && window.electron;

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleOpenFolder = useCallback(() => {
    if (isElectronApp) {
      onOpenFolder(instance.id);
    }
    setShowMenu(false);
  }, [instance.id, onOpenFolder, isElectronApp]);

  const handleScreenshots = useCallback(() => {
    setShowMenu(false);
    setShowScreenshots(true);
  }, []);

  const handleEdit = useCallback(() => {
    setShowMenu(false);
    setShowEditModal(true);
  }, []);

  const handleFindMods = useCallback(() => {
    setShowMenu(false);
    onBrowseContent('mods');
  }, [onBrowseContent]);

  const handlePlay = useCallback(() => {
    onPlay(instance.id);
  }, [instance.id, onPlay]);

  const handleDoubleClick = useCallback(() => {
    setShowDetails(true);
  }, []);

  return (
    <>
      <div
        onClick={() => onSelect(instance.id)}
        onDoubleClick={handleDoubleClick}
        className={`group text-left p-4 rounded-xl transition-all duration-150 cursor-pointer relative
          ${selected
            ? 'bg-emerald-500/15 border-2 border-emerald-500 shadow-lg shadow-emerald-500/20'
            : 'bg-[#1e1e32] border border-transparent hover:border-white/10'
          }`}
      >
        {selected && (
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-emerald-500 rounded-r-full" />
        )}
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl bg-[#12121f] flex items-center justify-center text-2xl shrink-0 transition-transform duration-150 group-hover:scale-105
            ${selected ? 'ring-2 ring-emerald-500 shadow-md shadow-emerald-500/30' : ''}`}
          >
            {instanceIcons[instance.icon] || instanceIcons.default}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium truncate text-lg">{instance.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-sm">{instance.version}</span>
              <span className={modloaderColors[instance.modloader] || 'text-gray-400'}>• {instance.modloader}</span>
              {contentCounts && contentCounts.mods > 0 && (
                <span className="text-emerald-400 text-xs bg-emerald-500/20 px-2 py-0.5 rounded-full">
                  {contentCounts.mods} mods
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-right shrink-0">
            <div className="flex items-center gap-1 text-gray-500 text-sm">
              <Clock size={14} />
              {formatPlayTime(instance.playTime)}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <MoreVertical size={18} />
              </button>

              {showMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 bg-[#1e1e32] rounded-xl border border-white/10 shadow-2xl py-1 z-50"
                  onClick={e => e.stopPropagation()}
                >
                  {isElectronApp && (
                    <button
                      onClick={handleOpenFolder}
                      className="w-full px-4 py-2.5 text-left text-gray-300 hover:bg-white/5 flex items-center gap-3 transition-colors"
                    >
                      <Folder size={16} />
                      Open Folder
                    </button>
                  )}
                  <button
                    onClick={handleScreenshots}
                    className="w-full px-4 py-2.5 text-left text-gray-300 hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <Image size={16} />
                    Screenshots
                  </button>
                  <button
                    onClick={handleEdit}
                    className="w-full px-4 py-2.5 text-left text-gray-300 hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <Edit2 size={16} />
                    Edit Info
                  </button>
                  <button
                    onClick={handleFindMods}
                    className="w-full px-4 py-2.5 text-left text-cyan-400 hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <ExternalLink size={16} />
                    Find Content
                  </button>
                  <div className="border-t border-white/10 my-1" />
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setShowMenu(false); }}
                    className="w-full px-4 py-2.5 text-left text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {selected && !showDeleteConfirm && (
          <div className="mt-4 flex justify-end items-center gap-2 pt-4 border-t border-white/10">
            {isElectronApp && (
              <button
                onClick={e => { e.stopPropagation(); handleOpenFolder(); }}
                className="px-4 py-2 text-gray-400 hover:text-white flex items-center gap-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <Folder size={18} />
                Open Folder
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); handlePlay(); }}
              disabled={!isElectronApp}
              className={`px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all duration-150 ${
                isElectronApp
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white hover:scale-105'
                  : 'bg-cyan-500/20 text-cyan-400'
              }`}
            >
              <Play size={18} />
              {isElectronApp ? 'Play' : 'Build to Launch'}
            </button>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="mt-4 p-4 bg-red-500/10 rounded-xl border border-red-500/30">
            <p className="text-red-400 text-sm mb-3">Delete "{instance.name}"? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={e => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                className="px-4 py-2 text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(instance.id); }}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {showEditModal && (
        <EditModal
          instance={instance}
          onClose={() => setShowEditModal(false)}
          onSave={(updates) => onUpdate(instance.id, updates)}
        />
      )}

      {showScreenshots && (
        <ScreenshotsModal
          instanceId={instance.id}
          onClose={() => setShowScreenshots(false)}
        />
      )}

      {showDetails && (
        <DetailsModal
          instance={instance}
          contentCounts={contentCounts}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
});
