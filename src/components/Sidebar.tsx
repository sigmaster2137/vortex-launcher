import { memo } from 'react';
import { User, Search, Settings, Layers, Zap } from 'lucide-react';
import type { ViewType } from '../types/launcher';

interface SidebarProps {
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  fps: number;
}

const navItems: { id: ViewType; icon: typeof User; label: string }[] = [
  { id: 'instances', icon: Layers, label: 'Instances' },
  { id: 'browse', icon: Search, label: 'Browse' },
  { id: 'accounts', icon: User, label: 'Accounts' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export const Sidebar = memo(function Sidebar({ view, onViewChange, fps }: SidebarProps) {
  const getFpsColor = () => {
    if (fps >= 55) return 'text-emerald-400';
    if (fps >= 30) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <aside className="w-16 bg-black/40 backdrop-blur-md flex flex-col items-center py-4 shrink-0 border-r border-white/10">
      <div className="mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-shadow cursor-pointer">
          <Zap size={20} className="text-white" fill="white" />
        </div>
      </div>

      <nav className="flex flex-col gap-1.5 flex-1 px-2">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 group relative
              ${view === item.id
                ? 'bg-emerald-500/30 text-emerald-400'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
          >
            <item.icon size={22} />
            {view === item.id && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-400 rounded-r-full" />
            )}
            <div className="absolute left-full ml-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-white/10">
              {item.label}
            </div>
          </button>
        ))}
      </nav>

      <div className={`mt-auto font-mono text-xs px-3 py-1 rounded-full bg-black/40 backdrop-blur-md ${getFpsColor()}`}>
        {fps}
      </div>
    </aside>
  );
});
