import { Suspense, lazy, useEffect, useState, Component, type ReactNode } from 'react';
import { useSession } from '../context/SessionContext';
import { useVoiceChat } from '../hooks/useVoiceChat';
import TableSeats from '../components/TableSeats';
const Mafia3DTable = lazy(() => import('../components/Mafia3DTable'));
import PlayerList from '../components/PlayerList';
import Chat from '../components/Chat';
import LogFeed from '../components/LogFeed';
import VoiceChat from '../components/VoiceChat';
import MafiaPanel from '../components/MafiaPanel';

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

export default function RoomPage() {
  const s = useSession();
  const room = s.room;
  const game = room?.game ?? null;
  const meId = s.meId;
  const voice = useVoiceChat(room?.code ?? null, meId);

  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const isHost = room?.hostId === meId;
  const lobby = game?.phase === 'lobby';

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!room || !game) {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-slate-400">
        <div className="animate-fade text-center">
          <img src="/supernova-favicon.svg" alt="SUPER NOVA" className="mx-auto mb-3 h-12 w-12 rounded-xl" />
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
        <img src="/supernova-favicon.svg" alt="SUPER NOVA" className="h-9 w-9 rounded-xl" />
        <div>
          <div className="flex items-center gap-1.5">
            {editingName ? (
              <>
                <input
                  className="input !w-auto !py-1 !px-2 text-sm"
                  value={nameDraft}
                  maxLength={24}
                  autoFocus
                  aria-label="Room name"
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void s.renameRoom(nameDraft).then((ok) => ok && setEditingName(false));
                    }
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                />
                <button
                  className="btn btn-primary !px-2.5 !py-1 text-xs"
                  disabled={s.busy}
                  onClick={() => void s.renameRoom(nameDraft).then((ok) => ok && setEditingName(false))}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-black leading-tight">{room.name}</span>
                {isHost && (
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-400 hover:text-white"
                    title="Rename table"
                    aria-label="Rename table"
                    onClick={() => {
                      setNameDraft(room.name);
                      setEditingName(true);
                    }}
                  >
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            round {game.round} · {room.players.length}/{room.maxPlayers} seats ·{' '}
            {game.phase === 'ended' ? 'finished' : game.phase === 'lobby' ? 'lobby' : `playing (${game.phase})`}
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

  const invitePanel = (
    <section className="panel p-4">
      <div className="mb-3">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Invite link</div>
        <div className="mt-2 rounded-xl border border-slate-600/50 bg-black/40 px-3 py-2">
          <div className="break-all font-mono text-[11px] leading-relaxed text-slate-100">{inviteUrl}</div>
        </div>
        <button
          className="btn btn-primary mt-2 w-full py-2.5"
          disabled={s.busy || !s.connected}
          onClick={copyCode}
          title="Copy invite link"
        >
          {copied ? 'copied' : 'Copy invite link'}
        </button>
        <div className="mt-1 text-[10px] text-slate-500">
          Send this to friends — anyone with the link can join the table.
        </div>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Room code</span>
          <span className="text-xs text-slate-500">{room.players.length}/{room.maxPlayers}</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <div className="font-mono text-3xl font-black tracking-[0.35em] text-gold-2 break-all">{room.code}</div>
          <button
            className="btn btn-ghost shrink-0 !px-2.5 !py-1 text-[11px]"
            onClick={copyCode}
            title="Copy room code"
          >
            {copied ? 'copied' : 'Copy code'}
          </button>
        </div>
        <div className="mt-1 text-[10px] text-slate-500">
          {room.players.length >= 2 ? 'Ready to start' : 'Waiting for at least 2 players…'}
        </div>
      </div>
    </section>
  );

  const chatPanel = (
    <section className="panel flex flex-1 flex-col gap-3 p-4">
      <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Table chat</h3>
      <Chat messages={s.chat} onSend={s.sendChat} disabled={!meId} />
      {!meId && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          You are not seated at this table — join from the home screen.
        </div>
      )}
    </section>
  );

  const tableFallback = (
    <TableSeats players={game.players} meId={meId} privateProfile={s.privateProfile} turnIndex={0} speaking={voice.speaking} mutedPeers={voice.mutedPeers} />
  );

  /* ---------------------------------- lobby --------------------------------- */
  if (lobby) {
    const enoughPlayers = room.players.length >= 2;
    return (
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-4 px-3 py-4">
        {header}

        <div className="grid min-h-0 gap-4 xl:grid-cols-[260px_1fr_360px]">
          <section className="flex min-w-0 flex-col gap-3">
            {invitePanel}
            {chatPanel}
          </section>

          <section className="flex min-w-0 flex-col items-center justify-center gap-4">
            <ThreeDErrorBoundary fallback={tableFallback}>
              <Suspense fallback={tableFallback}>
                <Mafia3DTable
                  players={game.players}
                  meId={meId}
                  privateProfile={s.privateProfile}
                  turnIndex={0}
                  speaking={voice.speaking}
                  mutedPeers={voice.mutedPeers}
                  startedAt={game.startedAt}
                  phase="lobby"
                  onLeave={() => void s.leaveRoom()}
                />
              </Suspense>
            </ThreeDErrorBoundary>
            <div className="rounded-xl border border-gold/40 bg-black/30 p-6 text-center">
              <div className="mb-2 flex justify-center">
                <img src="/supernova-favicon.svg" alt="SUPER NOVA logo" className="h-16 w-16 rounded-2xl" />
              </div>
              <div className="text-sm font-black uppercase tracking-wide text-slate-300">
                SUPER NOVA · Mafia Online
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Roles are assigned when the host starts the game — only you ever see yours.
              </div>
              {s.privateProfile && (
                <div className="mt-3 rounded-lg border border-slate-600/50 bg-black/40 px-3 py-2 text-[11px] text-slate-300">
                  Your seat is private — only you see your overhead label above your chair.
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
                  Start game
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-400">Waiting for the host to start…</div>
            )}
          </section>

          <aside className="flex min-h-0 flex-col gap-3">
            <section className="panel p-3">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Players</h3>
                <span className="ml-auto text-[10px] text-slate-500">
                  {room.players.length}/{room.maxPlayers}
                </span>
              </div>
              <PlayerList
                players={game.players}
                meId={meId}
                onKick={(id) => void s.kick(id)}
                canKick={Boolean(isHost)}
                speaking={voice.speaking}
              />
            </section>


            <section className="panel p-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Table host</h3>
              <div className="flex items-center gap-2 mb-3">
                {room.players[0]?.avatarUrl ? (
                  <img src={room.players[0].avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20" loading="lazy" />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black ring-2 ring-white/20"
                    style={{ background: room.players[0]?.color }}
                  >
                    {(room.players[0]?.name ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold">{room.players[0]?.name ?? '—'}</div>
                  <div className="text-[11px] text-gold-2">Host</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                The host starts the game and knows the invite code.
              </div>
            </section>
          </aside>
        </div>

        {/* Discord-style voice bar — bottom of the room UI */}
        <VoiceChat state={voice} players={game.players} meId={meId} me={s.me} />
      </div>
    );
  }

  /* ---------------------------------- game ---------------------------------- */
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-4 px-3 py-4">
      {header}

      <div className="grid min-h-0 gap-4 xl:grid-cols-[260px_1fr_360px]">
        <section className="flex min-w-0 flex-col gap-3">
          {invitePanel}
          {chatPanel}
          <section className="panel flex-col gap-2 p-3">
            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Table log</h3>
            <LogFeed log={game.log} className="max-h-52" />
          </section>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <MafiaPanel
            state={game}
            meId={meId}
            privateProfile={s.privateProfile}
            busy={s.busy}
            connected={s.connected}
            isHost={isHost}
            onNightAction={(kind, targetId) => void s.nightAction(kind, targetId)}
            onVote={(targetId) => void s.vote(targetId)}
            onEndPhase={() => void s.endPhase()}
          />
          <ThreeDErrorBoundary fallback={tableFallback}>
            <Suspense fallback={tableFallback}>
              <Mafia3DTable
                players={game.players}
                meId={meId}
                privateProfile={s.privateProfile}
                turnIndex={0}
                speaking={voice.speaking}
                mutedPeers={voice.mutedPeers}
                startedAt={game.startedAt}
                phase={game.phase}
                onLeave={() => void s.leaveRoom()}
              />
            </Suspense>
          </ThreeDErrorBoundary>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>
              Alive: <b className="text-emerald-300">{game.players.filter((p) => p.alive).length}</b>
            </span>
            <span>
              Out: <b className="text-slate-300">{game.players.filter((p) => !p.alive).length}</b>
            </span>
            <span>
              round <b className="text-slate-300">{game.round}</b>
            </span>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-3">
          <section className="panel p-3">
            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Players</h3>
            <PlayerList players={game.players} meId={meId} speaking={voice.speaking} mutedPeers={voice.mutedPeers} />
          </section>
          <section className="panel p-3">
            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Table host</h3>
            <div className="flex items-center gap-2">
              {room.players[0]?.avatarUrl ? (
                <img src={room.players[0].avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20" loading="lazy" />
              ) : (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black ring-2 ring-white/20"
                  style={{ background: room.players[0]?.color }}
                >
                  {(room.players[0]?.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold">{room.players[0]?.name ?? '—'}</div>
                <div className="text-[11px] text-gold-2">Host</div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Discord-style voice bar — bottom of the room UI */}
      <VoiceChat state={voice} players={game.players} meId={meId} me={s.me} />
    </div>
  );
}
