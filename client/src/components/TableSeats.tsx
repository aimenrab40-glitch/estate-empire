import { useMemo } from 'react';
import { emojiFor } from '@shared/avatars';
import { SECRET_ROLES, type PrivateProfile, type PublicPlayer } from '@shared/types';

/**
 * Mafia Table — 10 dedicated chairs around the table.
 *
 * PRIVACY MODEL (critical):
 * - Public info only: every client receives the shared RoomState (positions,
 *   cash, connected, avatar, colour) and renders each player's character +
 *   chair seat. This is visible to everyone — as required ("Other players may
 *   see the characters and their seats").
 * - Private info: NO player's username/secret-role overhead label is ever
 *   rendered for another player's chair. Each ChairSeat instance is created
 *   per player, and the overhead label JSX is emitted ONLY when
 *   `player.id === meId && privateProfile.playerId === meId`. The label is
 *   built from the local `privateProfile` (delivered via unicast private:profile,
 *   never via RoomState/broadcast), so it is rendered locally on this client
 *   only and never replicated to other clients.
 * - There is no shared/single UI element for the private label: each seat
 *   owns its own label node (see ChairSeat). The private label is not stored
 *   in GameState/RoomState, not persisted, and not present in any broadcast.
 *
 * Supports all 10 seats (MAX_PLAYERS is 10). Seats beyond player count render
 * as empty chairs.
 */

const SEAT_COUNT = 10;

/** Positions around the table (percent of the table container). */
function seatPos(seat: number): { left: string; top: string } {
  // Top row takes seats 1..3 texture — spread evenly around the ellipse.
  const angle = (seat / SEAT_COUNT) * Math.PI * 2 - Math.PI / 2;
  const rx = 44; // %
  const ry = 40; // %
  return {
    left: `${50 + Math.cos(angle) * rx}%`,
    top: `${52 + Math.sin(angle) * ry}%`,
  };
}

interface ChairSeatProps {
  player: PublicPlayer | null;
  seat: number;
  meId: string | null;
  privateProfile: PrivateProfile | null;
  isTurn: boolean;
  speaking: boolean;
  muted: boolean;
}

/**
 * One dedicated chair. The private overhead label lives INSIDE this
 * per-player component instance — it is not a shared element.
 */
function ChairSeat({ player, seat, meId, privateProfile, isTurn, speaking, muted }: ChairSeatProps) {
  const pos = seatPos(seat);
  const isMine = !!player && player.id === meId;
  // The private label may only exist for the local player AND only from the
  // locally-held unicast profile. Other seats render no label at all.
  const showPrivate = isMine && !!privateProfile && privateProfile.playerId === meId;
  const roleDef = privateProfile?.role ? SECRET_ROLES[privateProfile.role] : null;

  if (!player) {
    return (
      <div className="chair-empty" style={{ left: pos.left, top: pos.top }} aria-hidden="true">
        <span className="text-base font-bold text-slate-500">{seat + 1}</span>
      </div>
    );
  }

  return (
    <div className={`chair-seat ${isMine ? 'chair-mine' : ''} ${isTurn ? 'chair-turn' : ''}`}
      style={{ left: pos.left, top: pos.top }}
      title={player.name}
      data-testid={`chair-${player.id}`}
    >
      {/* Per-player private overhead label — rendered locally for the owner only.
          Never emitted for other players. */}
      {showPrivate && (
        <div className="private-label" role="status" aria-label="Your private identity">
          <span className="private-label-name">{privateProfile!.username}</span>
          {roleDef ? (
            <span className="private-label-role" style={{ borderColor: roleDef.color, color: roleDef.color }}>
              <span
                className="private-role-indicator"
                style={{ background: roleDef.color }}
                aria-hidden="true"
              />
              <span>{roleDef.emoji} {roleDef.label}</span>
            </span>
          ) : (
            <span className="private-label-role private-label-waiting">
              <span className="private-role-indicator" style={{ background: '#94a3b8' }} />
              <span>Awaiting secret role…</span>
            </span>
          )}
          {roleDef && <span className="private-label-hint">{roleDef.hint} · Only you see this</span>}
        </div>
      )}

      {/* Character seated on the dedicated chair (public — visible to all). */}
      <div
        className={`chair-character ${speaking && !muted ? 'chair-speaking' : ''}`}
        style={{
          background: player.color,
          opacity: player.connected ? 1 : 0.45,
          ...(muted ? { boxShadow: '0 0 0 3px #f23f43, 0 6px 14px rgba(0,0,0,0.55)' } : undefined),
        }}
      >
        {player.avatarUrl ? (
          <img src={player.avatarUrl} alt={player.name} className="h-full w-full rounded-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden="true">{emojiFor(player.avatar)}</span>
        )}
        <span className="chair-seat-num">{seat + 1}</span>
        {speaking && !muted && (
          <span className="chair-mic rounded bg-emerald-500 px-1 text-[8px] font-black text-white" title="Speaking">MIC</span>
        )}
        {muted && (
          <span className="chair-mute rounded bg-red-500 px-1 text-[8px] font-black text-white" title="Muted">×</span>
        )}
      </div>
      {player.isHost && <span className="chair-crown rounded bg-amber-500 px-1 text-[8px] font-black text-black" title="Host">HOST</span>}
      {!player.alive && <span className="chair-out text-[9px] font-black text-slate-400" title="Eliminated">OUT</span>}
      {!player.connected && <span className="chair-offline text-[9px] font-black text-slate-500" title="Offline">OFFLINE</span>}
    </div>
  );
}

interface TableSeatsProps {
  players: PublicPlayer[];
  meId: string | null;
  privateProfile: PrivateProfile | null;
  turnIndex?: number;
  speaking?: Set<string>;
  mutedPeers?: Set<string>;
}

export default function TableSeats({ players, meId, privateProfile, turnIndex = 0, speaking = new Set(), mutedPeers = new Set() }: TableSeatsProps) {
  const seats = useMemo(() => {
    return Array.from({ length: SEAT_COUNT }, (_, i) => players[i] ?? null);
  }, [players]);

  return (
    <div className="mafia-table" aria-label={`Mafia table with ${players.length} of ${SEAT_COUNT} seats filled`}>
      <div className="mafia-felt">
        <div className="mafia-emblem">SUPER NOVA</div>
        <div className="mafia-sub">MAFIA ONLINE · ZOMBIE MANSION TABLE</div>
      </div>
      {seats.map((player, seat) => (
        <ChairSeat
          key={player?.id ?? `empty-${seat}`}
          player={player}
          seat={seat}
          meId={meId}
          privateProfile={privateProfile}
          isTurn={player !== null && players[turnIndex]?.id === player.id}
          speaking={player !== null && speaking.has(player.id)}
          muted={player !== null && mutedPeers.has(player.id)}
        />
      ))}
    </div>
  );
}
