import { Suspense, lazy, useEffect, useMemo, useState, Component, type ReactNode } from 'react';
import { useSession } from '../context/SessionContext';
import { useVoiceChat } from '../hooks/useVoiceChat';
import Board from '../components/Board';
import TableSeats from '../components/TableSeats';
const Mafia3DTable = lazy(() => import('../components/Mafia3DTable'));
import Controls from '../components/Controls';
import PlayerList from '../components/PlayerList';
import Chat from '../components/Chat';
import LogFeed from '../components/LogFeed';
import PropertyManager from '../components/PropertyManager';
import StatsOverlay from '../components/StatsOverlay';
import VoiceChat from '../components/VoiceChat';
import { BOARD } from '@shared/board';
import { emojiFor } from '@shared/avatars';
import { SECRET_ROLES, type Rules } from '@shared/types';

/** If the 3D scene ever faults (weak GPU, driver, etc.), fall back to the 2D table instead of blanking the room. */
class ThreeDErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[3d] scene fault, falling back to 2D table:', error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const RULE_LABELS: { key: keyof Rules; label: string; hint: string }[] = [
  { key: 'doubleRentFullSet', label: 'Double rent for a full colour set', hint: 'Owning every tile of a colour group doubles base rent.' },
  { key: 'rentFreeWhenOwnerInJail', label: 'No rent while the owner is in jail', hint: 'A landlord behind bars cannot collect.' },
  { key: 'freeParkingPot', label: 'Taxes fill the Free Parking jackpot', hint: 'Land on Free Parking to win every tax paid so far.' },
  { key: 'auction', label: 'Declined properties go to auction', hint: 'If nobody buys outright, everyone can bid.' },
];

function Toggle({
  checked,
  disabled,
  label,
  hint,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
        disabled
          ? 'cursor-not-allowed border-slate-700/60 bg-black/20 opacity-60'
          : checked
            ? 'border-gold/50 bg-gold/10'
            : 'border-slate-600/40 bg-black/25 hover:border-slate-500'
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-amber-400"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-[11px] text-slate-400">{hint}</span>
      </span>
    </label>
  );
}

export default function RoomPage() {
  const s = useSession();
  const room = s.room;
  const game = room?.game ?? null;
  const meId = s.meId;
  const voice = useVoiceChat(room?.code ?? null, meId);

  const [copied, setCopied] = useState(false);

  const isHost = room?.hostId === meId;
  const lobby = game?.phase === 'lobby';
  const isMyTurn = game && game.players[game.turnIndex]?.id === meId;

  const rollKey = useMemo(
    () => (game?.dice ? `${game.dice[0]}-${game.dice[1]}-${game.updatedAt}` : 'idle'),
    [game?.dice, game?.updatedAt],
  );

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!room || !game) {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-slate-400">
        <div className="animate-fade text-center">
          <div className="mb-2 text-3xl">⏳</div>
          <div>Connecting to the table…</div>
        </div>
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/room/${room.code}`;
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
    } catch {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  };

  const header = (
    <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🎲</span>
        <div>
          <div className="text-sm font-black leading-tight">{room.name}</div>
          <div className="text-[11px] text-slate-400">
            round {game.round} · {room.players.length}/{room.maxPlayers} seats ·{' '}
            {game.phase === 'ended' ? 'finished' : room.status}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex ${
            s.connected
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/50 bg-rose-500/10 text-rose-300'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${s.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          {s.connected ? 'live' : 'offline'}
        </span>
        <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => void s.leaveRoom()}>
          Leave
        </button>
      </div>
    </header>
  );

  /* ---------------------------------- lobby --------------------------------- */
  if (lobby) {
    const enoughPlayers = room.players.length >= 2;
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-4 px-3 py-4">
        {header}

        <div className="grid min-h-0 gap-4 xl:grid-cols-[260px_1fr_360px]">
          {/* ---------------- LEFT: invite link + chat ---------------- */}
          <section className="flex min-w-0 flex-col gap-3">
            <section className="panel p-4">
              <div className="mb-3">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Invite link</div>
                <div className="mt-2 rounded-xl border border-slate-600/50 bg-black/40 px-3 py-2">
                  <div className="break-all font-mono text-[11px] leading-relaxed text-slate-100">
                    {inviteUrl}
                  </div>
                </div>
                <button
                  className="btn btn-primary mt-2 w-full py-2.5"
                  disabled={s.busy || !s.connected}
                  onClick={copyCode}
                  title="Copy invite link"
                >
                  {copied ? 'copied ✓' : '📋 Copy invite link'}
                </button>
                <div className="mt-1 text-[10px] text-slate-500">
                  Send this to friends — anyone with the link can join the table.
                </div>
              </div>
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Room code
                  </span>
                  <span className="text-xs text-slate-500">{room.players.length}/{room.maxPlayers}</span>
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="font-mono text-3xl font-black tracking-[0.35em] text-gold-2 break-all">
                    {room.code}
                  </div>
                  <button
                    className="btn btn-ghost shrink-0 !px-2.5 !py-1 text-[11px]"
                    onClick={copyCode}
                    title="Copy room code"
                  >
                    {copied ? 'copied ✓' : '📄'}
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {enoughPlayers ? 'Ready to start' : 'Waiting for at least 2 players…'}
                </div>
              </div>
            </section>

            <section className="panel flex-1 flex-col gap-3 p-4">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">
                Table chat
              </h3>
              <Chat messages={s.chat} onSend={s.sendChat} disabled={!meId} />
              {!meId && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                  You are not seated at this table — join from the home screen.
                </div>
              )}
            </section>
          </section>

          {/* ---------------- CENTER: waiting / board placeholder ---------------- */}
          <section className="flex min-w-0 flex-col items-center justify-center gap-4">
            <ThreeDErrorBoundary
              fallback={
                <TableSeats players={game.players} meId={meId} privateProfile={s.privateProfile} turnIndex={game.turnIndex} speaking={voice.speaking} />
              }
            >
              <Suspense fallback={<TableSeats players={game.players} meId={meId} privateProfile={s.privateProfile} turnIndex={game.turnIndex} speaking={voice.speaking} />}>
                <Mafia3DTable
                  players={game.players}
                  meId={meId}
                  privateProfile={s.privateProfile}
                  turnIndex={game.turnIndex}
                  speaking={voice.speaking}
                  startedAt={game.startedAt}
                  phase={game.phase}
                  onLeave={() => void s.leaveRoom()}
                />
              </Suspense>
            </ThreeDErrorBoundary>
            <div className="rounded-xl border border-gold/40 bg-black/30 p-6 text-center">
              <div className="text-5xl mb-2">🧟</div>
              <div className="text-sm font-black uppercase tracking-wide text-slate-300">
                SUPER NOVA · Mafia Online
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                The board appears here once the host starts the game.
              </div>
              {s.privateProfile && (
                <div className="mt-3 rounded-lg border border-slate-600/50 bg-black/40 px-3 py-2 text-[11px] text-slate-300">
                  🔒 Your seat is private — only you see your overhead label above your chair.
                </div>
              )}
            </div>
            {isHost ? (
              <div className="flex gap-3">
                <button
                  className="btn btn-primary px-6 py-3 text-base"
                  disabled={!enoughPlayers || s.busy || !s.connected}
                  onClick={() => void s.start()}
                >
                  🚀 Start game
                </button>
                <button className="btn btn-ghost px-4 py-2 text-sm" onClick={() => {}}>
                  Rules
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-400">Waiting for the host to start… 👑</div>
            )}
          </section>

          {/* ---------------- RIGHT: players + host + settings ---------------- */}
          <aside className="flex min-h-0 flex-col gap-3">
            <section className="panel p-3">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Players
                </h3>
                <span className="ml-auto text-[10px] text-slate-500">
                  {room.players.length}/{room.maxPlayers}
                </span>
              </div>
              <PlayerList
                players={game.players}
                turnIndex={game.turnIndex}
                meId={meId}
                ownerId={game.ownerId}
                compact
                speaking={voice.speaking}
                onKick={(id) => void s.kick(id)}
                canKick={Boolean(isHost)}
              />
            </section>

            <VoiceChat state={voice} players={game.players} meId={meId} />

            <section className="panel p-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                Table host
              </h3>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ring-2 ring-white/20"
                  style={{ background: room.players[0]?.color }}
                >
                  {room.players[0] ? emojiFor(room.players[0].avatar) : '🎩'}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold">{room.players[0]?.name ?? '—'}</div>
                  <div className="text-[11px] text-gold-2">👑 Host</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                The host controls house rules and starts the game.
              </div>
            </section>

            <section className="panel p-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                House rules {isHost ? '' : ' (host only)'}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {RULE_LABELS.map((rule) => (
                  <Toggle
                    key={rule.key}
                    label={rule.label}
                    hint={rule.hint}
                    checked={game.rules[rule.key]}
                    disabled={!isHost || s.busy}
                    onToggle={() => void s.setRules({ [rule.key]: !game.rules[rule.key] })}
                  />
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  /* --------------------------------- in game -------------------------------- */
  const card = game.lastCard;
  const currentPlayer = game.players[game.turnIndex];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-4 px-3 py-4">
      {header}
      {game.phase === 'ended' && (
        <StatsOverlay state={game} meId={meId} onLeave={() => void s.leaveRoom()} />
      )}

      <div className="grid min-h-0 gap-4 xl:grid-cols-[260px_1fr_360px]">
        {/* ---------------- LEFT: invite link + chat ---------------- */}
        <section className="flex min-w-0 flex-col gap-3">
          <section className="panel p-4">
            <div className="mb-3">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Invite link</div>
              <div className="mt-2 rounded-xl border border-slate-600/50 bg-black/40 px-3 py-2">
                <div className="break-all font-mono text-[11px] leading-relaxed text-slate-100">
                  {inviteUrl}
                </div>
              </div>
              <button
                className="btn btn-primary mt-2 w-full py-2.5"
                disabled={s.busy || !s.connected}
                onClick={copyCode}
                title="Copy invite link"
              >
                {copied ? 'copied ✓' : '📋 Copy invite link'}
              </button>
              <div className="mt-1 text-[10px] text-slate-500">
                Anyone with this link can join the table in real time.
              </div>
            </div>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Room code
                </span>
                <span className="text-xs text-slate-500">{room.players.length}/{room.maxPlayers}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-2xl font-black tracking-[0.35em] text-gold-2 break-all">
                  {room.code}
                </div>
                <button
                  className="btn btn-ghost shrink-0 !px-2.5 !py-1 text-[11px]"
                  onClick={copyCode}
                  title="Copy room code"
                >
                  {copied ? 'copied ✓' : '📄'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gold/50 bg-amber-950/10 p-3 mb-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                Turn status
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ring-2 ring-white/30"
                  style={{ background: currentPlayer?.color }}
                >
                  {emojiFor(currentPlayer?.avatar ?? 'tophat')}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold">{currentPlayer?.name ?? '—'}</div>
                  <div className="text-[11px] text-slate-400">
                    {game.phase === 'ended' ? 'Game finished' : isMyTurn ? 'Your turn' : 'Waiting…'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="panel flex-1 flex-col gap-3 p-4">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">
              Table chat
            </h3>
            <Chat messages={s.chat} onSend={s.sendChat} disabled={!meId} />
          </section>

          <section className="panel flex-col gap-2 p-3">
            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
              Match log
            </h3>
            <LogFeed log={game.log} className="max-h-52" />
          </section>
        </section>

        {/* ---------------- CENTER: board + dice + turn ---------------- */}
        <section className="flex min-w-0 flex-col gap-3">
          {card && (
            <div className="animate-card flex items-start gap-3 rounded-xl border border-gold/50 bg-gradient-to-r from-amber-950/80 to-black/40 px-4 py-2.5">
              <span className="text-xl">{card.deck === 'chance' ? '❓' : '📦'}</span>
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gold">
                  {card.deck === 'chance' ? 'Chance' : 'Community Chest'}
                </div>
                <div className="text-sm text-slate-100">{card.text}</div>
              </div>
            </div>
          )}

          <ThreeDErrorBoundary
            fallback={
              <TableSeats players={game.players} meId={meId} privateProfile={s.privateProfile} turnIndex={game.turnIndex} speaking={voice.speaking} />
            }
          >
            <Suspense fallback={<TableSeats players={game.players} meId={meId} privateProfile={s.privateProfile} turnIndex={game.turnIndex} speaking={voice.speaking} />}>
              <Mafia3DTable
                players={game.players}
                meId={meId}
                privateProfile={s.privateProfile}
                turnIndex={game.turnIndex}
                speaking={voice.speaking}
                startedAt={game.startedAt}
                phase={game.phase}
                onLeave={() => void s.leaveRoom()}
              />
            </Suspense>
          </ThreeDErrorBoundary>

          <div className="relative mx-auto w-full max-w-[min(90vh,900px)]">
            {/* Private overhead label is also pinned above the board for the local
                player only — one per-player node, stored locally from the unicast
                privateProfile. It never contains other players' data. */}
            {s.privateProfile && s.me && (
              <div className="private-board-badge" role="status">
                <span className="private-label-name">{s.privateProfile.username}</span>
                {s.privateProfile.role ? (
                  <>
                    <span className="private-role-indicator" style={{ background: SECRET_ROLES[s.privateProfile.role].color }} />
                    <span className="private-label-role" style={{ borderColor: SECRET_ROLES[s.privateProfile.role].color, color: SECRET_ROLES[s.privateProfile.role].color }}>
                      {SECRET_ROLES[s.privateProfile.role].emoji} {SECRET_ROLES[s.privateProfile.role].label}
                    </span>
                  </>
                ) : (
                  <span className="private-label-waiting">⏳ awaiting secret role…</span>
                )}
              </div>
            )}
            <Board state={game} meId={meId} speaking={voice.speaking}>
              <Controls
                state={game}
                me={s.me}
                isMyTurn={Boolean(isMyTurn)}
                busy={s.busy}
                rollKey={rollKey}
                onRoll={() => void s.roll()}
                onBuy={() => void s.buy()}
                onPass={() => void s.pass()}
                onEndTurn={() => void s.endTurn()}
                onPayBail={() => void s.payBail()}
                onBid={(n) => void s.bid(n)}
                onLeave={() => void s.leaveRoom()}
              />
            </Board>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span>
                pot: <b className="text-gold-2">${game.pot}</b>
              </span>
              <span>
                turn: <b className="text-slate-300">{game.players[game.turnIndex]?.name}</b>
              </span>
              <span>
                round <b className="text-slate-300">{game.round}</b>
              </span>
              <span className="hidden sm:inline">
                owned tiles:{' '}
                <b className="text-slate-300">
                  {game.ownerId.filter(Boolean).length}/{BOARD.length}
                </b>
              </span>
            </div>
          </div>
        </section>

        {/* ---------------- RIGHT: players + host + settings ---------------- */}
        <aside className="flex min-h-0 flex-col gap-3">
          <section className="panel p-3">
            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
              Players
            </h3>
            <PlayerList
              players={game.players}
              turnIndex={game.turnIndex}
              meId={meId}
              ownerId={game.ownerId}
              compact
              speaking={voice.speaking}
            />
          </section>

          <PropertyManager
            state={game}
            me={s.me}
            meId={meId}
            busy={s.busy}
            onBuild={(t) => void s.build(t)}
            onSellBuilding={(t) => void s.sellBuilding(t)}
            onMortgage={(t) => void s.mortgage(t)}
            onUnmortgage={(t) => void s.unmortgage(t)}
          />

          <VoiceChat state={voice} players={game.players} meId={meId} />

          <section className="panel p-3">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ring-2 ring-white/20"
                style={{ background: room.players[0]?.color }}
              >
                {room.players[0] ? emojiFor(room.players[0].avatar) : '🎩'}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold">{room.players[0]?.name ?? '—'}</div>
                <div className="text-[11px] text-gold-2">👑 Host</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mb-3">
              The host controls house rules and starts the game.
            </div>

            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
              House rules {isHost ? '' : ' (host only)'}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {RULE_LABELS.map((rule) => (
                <Toggle
                  key={rule.key}
                  label={rule.label}
                  hint={rule.hint}
                  checked={game.rules[rule.key]}
                  disabled={!isHost || s.busy}
                  onToggle={() => void s.setRules({ [rule.key]: !game.rules[rule.key] })}
                />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
