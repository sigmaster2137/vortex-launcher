import { memo } from 'react';
import { Minus, Square, X, Zap } from 'lucide-react';
import { useWindowControls } from '../hooks/useElectron';

export const TitleBar = memo(function TitleBar() {
  const { minimize, maximize, close, isElectron } = useWindowControls();

  if (!isElectron) return null;

  return (
    <div
      className="h-10 bg-[#0d0d1a] flex items-center justify-between px-4 select-none border-b border-white/5"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-sm">
          <Zap size={14} className="text-white" fill="white" />
        </div>
        <span className="text-gray-400 text-sm font-medium">Vortex Launcher</span>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={minimize}
          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={maximize}
          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors"
        >
          <Square size={14} />
        </button>
        <button
          onClick={close}
          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-red-500/80 rounded-md transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
});
