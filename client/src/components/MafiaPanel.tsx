import { useEffect, useState } from 'react';
import { emojiFor } from '@shared/avatars';
import { SECRET_ROLES, type GameState, type MafiaRoleId, type PrivateProfile, type PublicPlayer } from '@shared/types';

interface MafiaPanelProps {
  state: GameState;
  meId: string | null;
  privateProfile: PrivateProfile | null;
  busy: boolean;
  connected?: boolean;
  isHost?: boolean;
  onNightAction: (kind: 'kill' | 'save' | 'investigate' | 'shield', targetId: string) => void;
  onVote: (targetId: string | null) => void;
  onEndPhase?: () => void;
}

function useCountdown(endsAt: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [endsAt]);
  return left;
}

const ROLE_ACTION: Partial<Record<MafiaRoleId, { kind: 'kill' | 'save' | 'investigate' | 'shield'; label: string }>> = {
  mafia: { kind: 'kill', label: 'Choose a victim' },
  doctor: { kind: 'save', label: 'Save a player' },
  detective: { kind: 'investigate', label: 'Investigate a player' },
  sheikh: { kind: 'shield', label: 'Shield a player' },
};

export default function MafiaPanel({ state, meId, privateProfile, busy, isHost = false, onNightAction, onVote, onEndPhase }: MafiaPanelProps) {
  const secondsLeft = useCountdown(state.phaseEndsAt);
  const me = state.players.find((p) => p.id === meId) ?? null;
  const myRole = privateProfile?.role ?? null;
  const roleDef = myRole ? SECRET_ROLES[myRole] : null;
  const aliveOthers = state.players.filter((p) => p.alive && p.id !== meId);
  const [pick, setPick] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Phase header
  const phaseTitle =
    state.phase === 'night'
      ? `Night ${state.round}`
      : state.phase === 'day'
        ? `Day ${state.round} — vote!`
        : state.phase === 'ended'
          ? 'Game over'
          : 'Lobby';

  const action = myRole ? ROLE_ACTION[myRole] : undefined;

  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <div className="flex items-center gap-3">
        <span className="text-lg font-black text-slate-100">{phaseTitle}</span>
        {state.phaseEndsAt && state.phase !== 'ended' && (
          <span className="rounded-full border border-white/20 bg-black/40 px-2.5 py-0.5 font-mono text-xs text-amber-200">
            {secondsLeft}s
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-slate-200">{state.message}</div>

      {state.phase === 'ended' && state.winnerTeam && (
        <div className="rounded-xl border border-gold/50 bg-amber-950/30 px-4 py-2 text-sm font-bold text-amber-100">
          {state.winnerTeam === 'mafia' ? 'Mafia wins!' : 'Town wins!'}
        </div>
      )}

      {state.phase === 'night' && me && !me.alive && (
        <div className="text-sm text-slate-400">You are dead — watch the table.</div>
      )}

      {state.phase === 'night' && me?.alive && roleDef && action && (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-xl border px-3 py-3" style={{ borderColor: roleDef.color, background: 'rgba(0,0,0,0.35)' }}>
          <div className="text-sm font-black" style={{ color: roleDef.color }}>
            {roleDef.emoji} {roleDef.label}
          </div>
          <div className="text-[11px] text-slate-400">{roleDef.hint}</div>
          <div className="mt-1 grid max-h-52 gap-1 overflow-y-auto">
            {aliveOthers.map((p) => (
              <button
                key={p.id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${
                  pick === p.id ? 'border-gold bg-gold/15' : 'border-slate-600/40 bg-black/25 hover:bg-black/40'
                }`}
                onClick={() => setPick(p.id)}
              >
                <PlayerAvatar player={p} size={24} />
                <span className="font-semibold text-slate-100">{p.name}</span>
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary mt-1"
            disabled={busy || !pick}
            onClick={() => {
              if (pick) {
                onNightAction(action.kind, pick);
                setSaved(pick);
              }
            }}
          >
            {action.label} {saved === pick ? '(saved)' : ''}
          </button>
          {saved && (
            <div className="text-[11px] font-semibold text-emerald-300">
              Your pick is saved — you can still change it until dawn.
            </div>
          )}
          <div className="text-[10px] text-slate-500">
            {myRole === 'sheikh'
              ? `Shield charges left: ${state.shieldCharges}`
              : 'Last choice before dawn wins — you can change it until night ends.'}
          </div>
        </div>
      )}

      {state.phase === 'night' && me?.alive && myRole === 'citizen' && (
        <div className="text-sm text-slate-400">Citizens sleep at night — wait for dawn.</div>
      )}

      {state.phase === 'day' && me?.alive && (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-white/15 bg-black/30 px-3 py-3">
          <div className="text-sm font-black text-slate-100">Vote for the Mafia</div>
          <div className="grid max-h-52 gap-1 overflow-y-auto">
            {([...aliveOthers, me].sort((a, b) => Number(a.id === meId) - Number(b.id === meId))).map((p) => {
              const mine = state.votes[meId ?? ''] === p.id;
              return (
                <button
                  key={p.id}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${
                    mine ? 'border-red-500 bg-red-950/40' : 'border-slate-600/40 bg-black/25 hover:bg-black/40'
                  }`}
                  disabled={p.id === meId}
                  onClick={() => onVote(mine ? null : p.id)}
                >
                  <PlayerAvatar player={p} size={24} />
                  <span className="font-semibold text-slate-100">{p.name}{p.id === meId ? ' (you)' : ''}</span>
                  {mine && <span className="ml-auto text-[10px] text-red-300">your vote</span>}
                  {!mine && p.id !== meId && (
                    <span className="ml-auto text-[10px] text-slate-500">
                      {Object.values(state.votes).filter((t) => t === p.id).length} vote(s)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-400">
            Votes: {Object.keys(state.votes).length}/{state.players.filter((p) => p.alive).length} cast.
            You cannot vote for yourself. Tap again to clear your vote.
          </div>
        </div>
      )}

      {state.phase === 'day' && me && !me.alive && (
        <div className="text-sm text-slate-400">You are dead — the town votes without you.</div>
      )}

      {isHost && (state.phase === 'night' || state.phase === 'day') && onEndPhase && (
        <button className="btn btn-ghost text-xs" disabled={busy} onClick={onEndPhase}>
          End {state.phase} now (host)
        </button>
      )}
    </div>
  );
}

export function PlayerAvatar({ player, size = 36 }: { player: PublicPlayer; size?: number }) {
  if (player.avatarUrl) {
    return (
      <img
        src={player.avatarUrl}
        alt={player.name}
        className="shrink-0 rounded-full object-cover ring-2 ring-white/20"
        style={{ width: size, height: size, background: player.color }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full ring-2 ring-white/20"
      style={{ background: player.color, width: size, height: size, fontSize: size * 0.55 }}
      title={player.name}
    >
      {emojiFor(player.avatar)}
    </span>
  );
}
