import { memo, useState, useCallback } from 'react';
import { Plus, UserPlus, LogOut, X, User } from 'lucide-react';
import type { MinecraftAccount } from '../types/launcher';

interface AccountsViewProps {
  accounts: MinecraftAccount[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddOffline: (username: string) => void;
  onRemove: (id: string) => void;
}

export const AccountsView = memo(function AccountsView({
  accounts,
  selectedId,
  onSelect,
  onAddOffline,
  onRemove,
}: AccountsViewProps) {
  const [showModal, setShowModal] = useState(false);
  const [username, setUsername] = useState('');

  const handleAdd = useCallback(() => {
    if (!username.trim()) return;
    onAddOffline(username.trim());
    setUsername('');
    setShowModal(false);
  }, [username, onAddOffline]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Accounts</h2>
            <p className="text-gray-500 text-sm mt-1">Add offline accounts</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium flex items-center gap-2 transition-all duration-150"
            >
              <Plus size={18} />
              Offline
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-[#1e1e32] flex items-center justify-center mb-4">
              <User size={36} className="text-gray-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No accounts</h3>
            <p className="text-gray-500 mb-6">Add an account to start playing</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium flex items-center gap-2 transition-colors"
            >
              <UserPlus size={18} />
              Create Account
            </button>
          </div>
        ) : (
          <div className="grid gap-3 max-w-2xl">
            {accounts.map(account => (
              <div
                key={account.id}
                onClick={() => onSelect(account.id)}
                className={`group w-full text-left p-4 rounded-2xl flex items-center gap-4 transition-all duration-150 cursor-pointer
                  ${selectedId === account.id
                    ? 'bg-emerald-500/10 border-2 border-emerald-500/40'
                    : 'bg-[#1e1e32] border-2 border-transparent hover:border-white/10'
                  }`}
              >
                <div className="relative">
                  <img
                    src={account.avatar}
                    alt={account.username}
                    className={`w-14 h-14 rounded-xl transition-transform duration-150 group-hover:scale-105
                      ${selectedId === account.id ? 'ring-2 ring-emerald-500/60' : ''}`}
                    onError={e => { (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve'; }}
                  />
                  {selectedId === account.id && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold">{account.username}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">
                      Offline
                    </span>
                    <span className="text-gray-500 text-xs font-mono truncate">{account.uuid.slice(0, 8)}...</span>
                  </div>
                </div>

                <button
                  onClick={e => { e.stopPropagation(); onRemove(account.id); }}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ))}

            <button
              onClick={() => setShowModal(true)}
              className="w-full p-4 rounded-2xl border-2 border-dashed border-white/10 text-gray-500 hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/5 flex items-center justify-center gap-3 transition-all duration-150"
            >
              <UserPlus size={20} />
              <span className="font-medium">Add Another Account</span>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[#1a1a2e] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Add Account</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <p className="text-gray-400 text-sm mb-4">
              Enter a username for your offline account. This works in singleplayer and on servers with offline mode enabled.
            </p>

            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
              maxLength={16}
              className="w-full px-4 py-3 bg-[#12121f] text-white rounded-xl border border-white/10 focus:border-emerald-500/50 outline-none transition-colors mb-4"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 text-gray-400 hover:text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!username.trim() || username.length < 3}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
              >
                Add Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
