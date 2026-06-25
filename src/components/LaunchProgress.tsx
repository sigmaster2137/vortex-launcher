import { memo, useEffect, useState } from 'react';
import { X, Loader2, Check, AlertCircle, Square } from 'lucide-react';

export type LaunchStatus = 'idle' | 'preparing' | 'launching' | 'playing' | 'error' | 'downloading';

interface LaunchProgressProps {
  status: LaunchStatus;
  progress: number;
  message: string;
  onClose: () => void;
  onAbort?: () => void;
}

export const LaunchProgress = memo(function LaunchProgress({ status, progress, message, onClose, onAbort }: LaunchProgressProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(status !== 'idle');
  }, [status]);

  if (!show) return null;

  const statusColors: Record<LaunchStatus, string> = {
    idle: 'text-gray-400',
    preparing: 'text-amber-400',
    launching: 'text-emerald-400',
    playing: 'text-emerald-400',
    error: 'text-red-400',
    downloading: 'text-cyan-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1a1a2e] rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-white/10 animate-scale-in">
        <div className="flex justify-between items-start mb-6">
          <div className={`flex items-center gap-2 ${statusColors[status]}`}>
            {status === 'error' ? (
              <AlertCircle size={24} />
            ) : status === 'playing' ? (
              <Check size={24} />
            ) : (
              <Loader2 size={24} className="animate-spin" />
            )}
            <span className="font-semibold capitalize">{status}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-gray-300 text-center mb-6">{message}</p>

        {status !== 'playing' && status !== 'error' && (
          <>
            <div className="relative h-2 bg-[#12121f] rounded-full overflow-hidden mb-4">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-400">{progress.toFixed(0)}%</p>
          </>
        )}

        {status === 'downloading' && onAbort && (
          <button
            onClick={onAbort}
            className="w-full mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <Square size={16} />
            Cancel Download
          </button>
        )}

        {status === 'playing' && (
          <div className="text-center">
            <p className="text-emerald-400 text-sm">Game is running</p>
          </div>
        )}
      </div>
    </div>
  );
});
