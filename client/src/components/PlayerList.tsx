import { SECRET_ROLES, type PublicPlayer } from '@shared/types';
import { PlayerAvatar } from './MafiaPanel';

interface PlayerListProps {
  players: PublicPlayer[];
  meId: string | null;
  compact?: boolean;
  onKick?: (playerId: string) => void;
  canKick?: boolean;
  speaking?: Set<string>;
  mutedPeers?: Set<string>;
}

export default function PlayerList({
  players,
  meId,
  compact = false,
  onKick,
  canKick = false,
  speaking = new Set(),
  mutedPeers = new Set(),
}: PlayerListProps) {
  return (
    <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
      {players.map((p) => {
        const dead = !p.alive;
        const role = !p.alive ? SECRET_ROLES[p.role ?? 'citizen'] : null;
        const isMuted = mutedPeers.has(p.id);
        const isSpeaking = speaking.has(p.id) && !isMuted;
        return (
          <li
            key={p.id}
            className={`relative flex items-center gap-3 rounded-xl border px-3 ${
              compact ? 'py-2' : 'py-2.5'
            } border-slate-600/40 bg-black/25 ${p.connected ? '' : 'opacity-55'} ${dead ? 'opacity-60 saturate-0' : ''}`}
          >
            <PlayerAvatar player={p} size={36} />
            {isSpeaking && (
              <span
                className="absolute left-1 top-1 h-3 w-3 animate-pulse rounded-full bg-emerald-400 ring-2 ring-emerald-200"
                title="Speaking"
              />
            )}
            {isMuted && (
              <span
                className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white ring-2 ring-red-900"
                title="Muted"
              >
                🔇
              </span>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`truncate text-sm font-bold ${dead ? 'line-through text-slate-400' : ''}`}>
                  {p.name}
                  {p.id === meId && <span className="ml-1 text-[10px] text-slate-400">(you)</span>}
                  {isMuted && <span className="ml-1 text-[10px] font-bold text-red-400" title="Muted">MUTE</span>}
                  {isSpeaking && <span className="ml-1 text-[10px] font-bold text-emerald-300" title="Speaking">TALK</span>}
                </span>
                {p.isHost && <span title="Host">👑</span>}
                {p.provider && <span title={`Signed in with ${p.provider}`} className="text-[10px] text-slate-500">{p.provider === 'google' ? 'G' : 'D'}</span>}
              </div>
              <div className="text-[11px] text-slate-400">
                {dead && role ? (
                  <span style={{ color: role.color }}>
                    {role.emoji} {role.label} — dead
                  </span>
                ) : dead ? (
                  '💀 Dead'
                ) : p.connected ? (
                  '🟢 Alive'
                ) : (
                  '💤 Offline'
                )}
              </div>
            </div>

            <div className="text-right">
              <div className={`font-black tabular-nums ${dead ? 'text-rose-400' : 'text-emerald-300'}`}>
                {dead ? '💀' : '☀️'}
              </div>
              {canKick && !p.isHost && p.id !== meId && onKick && (
                <button
                  className="text-[10px] text-slate-400 underline hover:text-rose-300"
                  onClick={() => onKick(p.id)}
                >
                  remove
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
