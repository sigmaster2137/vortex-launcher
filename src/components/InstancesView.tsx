import { memo, useCallback, useState, useEffect } from 'react';
import { Plus, Search, SortAsc, SortDesc, Package } from 'lucide-react';
import { InstanceCard } from './InstanceCard';
import { NewInstanceModal } from './NewInstanceModal';
import type { MinecraftInstance, ViewType } from '../types/launcher';

interface InstancesViewProps {
  instances: MinecraftInstance[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<MinecraftInstance>) => void;
  onCreateInstance: (name: string, version: string, modloader: string) => void;
  onOpenFolder: (id: string) => void;
  onNavigate: (view: ViewType) => void;
}

type SortType = 'name' | 'lastPlayed' | 'playTime';

export const InstancesView = memo(function InstancesView({
  instances,
  selectedId,
  onSelect,
  onPlay,
  onDelete,
  onUpdate,
  onCreateInstance,
  onOpenFolder,
  onNavigate,
}: InstancesViewProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortType>('lastPlayed');
  const [sortAsc, setSortAsc] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [contentCounts, setContentCounts] = useState<Record<string, { mods: number; shaders: number; resourcepacks: number }>>({});

  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);
  const handlePlay = useCallback((id: string) => onPlay(id), [onPlay]);
  const handleDelete = useCallback((id: string) => onDelete(id), [onDelete]);
  const handleOpenFolder = useCallback((id: string) => onOpenFolder(id), [onOpenFolder]);
  const handleUpdate = useCallback((id: string, updates: Partial<MinecraftInstance>) => onUpdate(id, updates), [onUpdate]);

  const handleBrowseContent = useCallback((_type: 'mods' | 'shaderpacks' | 'resourcepacks') => {
    onNavigate('browse');
  }, [onNavigate]);

  // Load content counts for all instances
  useEffect(() => {
    let mounted = true;
    
    const loadContentCounts = async () => {
      if (typeof window === 'undefined' || !window.electron) return;

      const newCounts: Record<string, { mods: number; shaders: number; resourcepacks: number }> = {};
      
      for (const instance of instances) {
        try {
          const electron = window.electron;
          if (!electron) continue;
          
          const [modsResult, shadersResult, packsResult] = await Promise.all([
            electron.listInstalledContent(instance.id, 'mod'),
            electron.listInstalledContent(instance.id, 'shader'),
            electron.listInstalledContent(instance.id, 'resourcepack'),
          ]);

          newCounts[instance.id] = {
            mods: modsResult.success && modsResult.items ? modsResult.items.length : 0,
            shaders: shadersResult.success && shadersResult.items ? shadersResult.items.length : 0,
            resourcepacks: packsResult.success && packsResult.items ? packsResult.items.length : 0,
          };
        } catch (error) {
          console.error(`Failed to load content counts for ${instance.id}:`, error);
          newCounts[instance.id] = { mods: 0, shaders: 0, resourcepacks: 0 };
        }
      }
      
      if (mounted) setContentCounts(newCounts);
    };

    loadContentCounts();
    return () => { mounted = false; };
  }, [instances]);

  const filtered = instances
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mult = sortAsc ? 1 : -1;
      if (sort === 'name') return mult * a.name.localeCompare(b.name);
      if (sort === 'playTime') return mult * (a.playTime - b.playTime);
      return mult * new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
    });

  const cycleSort = () => {
    if (sort === 'lastPlayed') setSort('name');
    else if (sort === 'name') setSort('playTime');
    else setSort('lastPlayed');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Instances</h2>
            <p className="text-gray-500 text-sm mt-1">Double-click an instance to view details</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium flex items-center gap-2 transition-all duration-150 hover:scale-105"
          >
            <Plus size={18} />
            New Instance
          </button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search instances..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#1e1e32] text-white rounded-xl border border-transparent focus:border-emerald-500/50 outline-none transition-colors"
            />
          </div>
          <button
            onClick={() => { cycleSort(); setSortAsc(!sortAsc); }}
            className="px-4 bg-[#1e1e32] rounded-xl border border-transparent hover:border-white/10 flex items-center gap-2 transition-colors"
          >
            {sortAsc ? <SortAsc size={18} className="text-gray-400" /> : <SortDesc size={18} className="text-gray-400" />}
            <span className="text-gray-400 text-sm capitalize">{sort === 'lastPlayed' ? 'Recent' : sort}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-[#1e1e32] flex items-center justify-center mb-4">
              <Package size={36} className="text-gray-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No instances yet</h3>
            <p className="text-gray-500 mb-6">Create your first instance to get started</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium flex items-center gap-2 transition-all duration-150 hover:scale-105"
            >
              <Plus size={20} />
              Create Instance
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(instance => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                selected={selectedId === instance.id}
                onSelect={handleSelect}
                onPlay={handlePlay}
                onDelete={handleDelete}
                onOpenFolder={handleOpenFolder}
                onUpdate={handleUpdate}
                onBrowseContent={handleBrowseContent}
                contentCounts={contentCounts[instance.id]}
              />
            ))}
          </div>
        )}
      </div>

      <NewInstanceModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={onCreateInstance}
      />
    </div>
  );
});
