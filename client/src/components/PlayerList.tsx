import { emojiFor } from '@shared/avatars';
import { BOARD } from '@shared/board';
import type { PublicPlayer } from '@shared/types';

interface PlayerListProps {
  players: PublicPlayer[];
  turnIndex: number;
  meId: string | null;
  ownerId: (string | null)[];
  compact?: boolean;
  onKick?: (playerId: string) => void;
  canKick?: boolean;
  speaking?: Set<string>;
}

export default function PlayerList({
  players,
  turnIndex,
  meId,
  ownerId,
  compact = false,
  onKick,
  canKick = false,
  speaking = new Set(),
}: PlayerListProps) {
  return (
    <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
      {players.map((p, i) => {
        const isTurn = i === turnIndex && !p.bankrupt;
        const holdings = ownerId.filter((o) => o === p.id).length;
        const groupCount = new Set(
          p.properties.map((t) => BOARD[t].group).filter(Boolean) as string[],
        ).size;

        return (
          <li
            key={p.id}
            className={`relative flex items-center gap-3 rounded-xl border px-3 ${
              compact ? 'py-2' : 'py-2.5'
            } ${
              isTurn
                ? 'turn-glow border-gold/60 bg-gold/10'
                : 'border-slate-600/40 bg-black/25'
            } ${p.connected ? '' : 'opacity-55'}`}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ring-2 ring-white/20"
              style={{ background: p.color }}
              title={p.name}
            >
              {emojiFor(p.avatar)}
            </span>
            {speaking.has(p.id) && (
              <span
                className="absolute left-1 top-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-emerald-200 animate-pulse"
                title="Speaking"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold">
                  {p.name}
                  {p.id === meId && <span className="ml-1 text-[10px] text-slate-400">(you)</span>}
                </span>
                {p.isHost && <span title="Host">👑</span>}
                {p.inJail && <span title="In jail">🔒</span>}
                {!p.connected && <span title="Disconnected">💤</span>}
                {p.bankrupt && <span title="Bankrupt">❌</span>}
              </div>
              <div className="text-[11px] text-slate-400">
                {holdings} tile{holdings === 1 ? '' : 's'} · {groupCount} set
                {groupCount === 1 ? '' : 's'}
                {p.jailCards > 0 && <> · 🎟 ×{p.jailCards}</>}
              </div>
            </div>

            <div className="text-right">
              <div className={`font-black tabular-nums ${p.bankrupt ? 'text-rose-400 line-through' : 'text-emerald-300'}`}>
                ${p.cash.toLocaleString('en-US')}
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
