import { useEffect, useRef, useState } from 'react';
import { useSession } from '../context/SessionContext';
import AvatarPicker from '../components/AvatarPicker';
import { api } from '../lib/api';
import { emojiFor } from '@shared/avatars';
import type { ApiRoomSummary, MatchHistoryRow } from '@shared/types';
import { MAX_PLAYERS, MIN_PLAYERS } from '@shared/board';
import SuperNovaBanner from '../components/SuperNovaBanner';

export default function Home() {
  const { createRoom, joinRoom, profile, saveProfileFields, connected, busy } = useSession();
  const [code, setCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [rooms, setRooms] = useState<ApiRoomSummary[]>([]);
  const [history, setHistory] = useState<MatchHistoryRow[]>([]);
  const [health, setHealth] = useState<{ db: string; rooms: number } | null>(null);
  const [joiningCode, setJoiningCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeError, setCodeError] = useState('');
  const deepLinkHandled = useRef(false);

  // Room codes are 4–6 letters/digits (server issues 6). Validated on-device
  // before Join, and again authoritatively by the server on join.
  const CODE_RE = /^[A-Z0-9]{4,6}$/;

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopyCode = async () => {
    const c = code.trim().toUpperCase();
    if (!CODE_RE.test(c)) {
      setCodeError('Type or paste a valid code first, then copy it.');
      return;
    }
    try {
      await navigator.clipboard.writeText(c);
    } catch {
      // clipboard API unavailable (e.g. non-secure context) — select + copy fallback
      try {
        const inp = document.querySelector('input[aria-label="Room code"]') as HTMLInputElement | null;
        inp?.focus();
        inp?.select();
        document.execCommand('copy');
      } catch {
        /* clipboard truly unavailable — user can read the code from the field */
      }
    }
    setCopied(true);
    setCodeError('');
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      // prefer a full 6-char code (what the server issues) over shorter words
      const m = text.toUpperCase().match(/[A-Z0-9]{6}/) ?? text.toUpperCase().match(/[A-Z0-9]{4,5}/);
      if (m) {
        setCode(m[0]);
        setCodeError('');
        setCopied(false);
      } else {
        setCodeError('No valid code found in the clipboard. Copy the room code your friend sent first.');
      }
    } catch {
      setCodeError('Clipboard read was blocked — tap the field and paste with long-press, or type the code.');
      (document.querySelector('input[aria-label="Room code"]') as HTMLInputElement | null)?.focus();
    }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [h, r, hist] = await Promise.all([api.health(), api.rooms(), api.history()]);
      if (!alive) return;
      if (h) setHealth({ db: h.db, rooms: h.rooms });
      if (r) setRooms(r);
      if (hist) setHistory(hist);
    };
    void load();
    const t = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  // Shareable room links: /room/:CODE auto-joins the table when opened anywhere.
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const m = window.location.pathname.match(/^\/room\/([A-Za-z0-9]{4,})\/?$/i);
    if (!m) return;
    const code = m[1].toUpperCase();
    if (!connected) return;
    deepLinkHandled.current = true;
    setJoiningCode(code);
    void joinRoom(code).finally(() => {
      setJoiningCode(null);
      // Keep the URL clean after a successful (or failed) join attempt.
      try {
        window.history.replaceState({}, '', '/');
      } catch {
        /* ignore */
      }
    });
  }, [connected, joinRoom]);

  const handleCreate = async () => {
    if (!profile.name.trim()) {
      saveProfileFields({ name: 'Player 1' });
    }
    await createRoom({ roomName: roomName.trim() || undefined });
  };

  const handleJoin = async (target?: string) => {
    const value = (target ?? code).trim().toUpperCase();
    if (value.length < 4) return;
    setJoiningCode(value);
    await joinRoom(value);
    setJoiningCode(null);
  };

  const openRooms = rooms.filter((r) => r.status === 'lobby' && r.playerCount < r.maxPlayers);

  return (
    <div className="sn-login mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {/* --------------------------- top nav ---------------------------- */}
      <nav
        aria-label="SUPER NOVA"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur"
      >
        <a href="/" className="flex items-center gap-2.5 font-black tracking-wide">
          <img src="/supernova-favicon.svg" alt="SUPER NOVA logo" className="h-9 w-9 rounded-xl" />
          <span className="text-base text-white">
            SUPER <span className="text-red-500">NOVA</span>
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a
            href="/"
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-semibold text-slate-100 transition hover:bg-white/15"
          >
            🎲 Play the game
          </a>
          <a
            href="https://github.com/aimenrab40-glitch/estate-empire"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-semibold text-slate-100 transition hover:bg-white/15"
          >
            🧑‍💻 GitHub
          </a>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-semibold text-slate-100 transition hover:bg-white/15"
          >
            ❤️ Server status
          </a>
        </div>
      </nav>

      {/* --------------------------- SUPER NOVA banner ---------------------------- */}
      <SuperNovaBanner />

      {/* ---------------------------------- hero --------------------------------- */}
      <header className="sn-hero panel relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-red-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />
        <div className="sn-stars" aria-hidden="true" />

        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-4">
            <img
              src="/supernova-favicon.svg"
              alt="SUPER NOVA logo"
              className="sn-logo-glow h-16 w-16 shrink-0 rounded-2xl sm:h-20 sm:w-20"
            />
            <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.35em] text-red-400">
              SUPER NOVA · real-time multiplayer
            </div>
            <h1 className="sn-title text-4xl font-black leading-none text-white sm:text-5xl">
              SUPER <span className="text-red-500">NOVA</span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-slate-300">
              Mafia online with friends — step into the 3D table, trade property, dodge the tax
              man and take down the Mafia. Live in your browser on phone and desktop.
            </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-right text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${
                connected
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/50 bg-rose-500/10 text-rose-300'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {connected ? 'server connected' : 'connecting…'}
            </span>
            {health && (
              <span className="text-slate-400">
                database: <b className="text-slate-200">{health.db}</b> · rooms open:{' '}
                <b className="text-slate-200">{health.rooms}</b>
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------ create room ----------------------------- */}
        <section className="panel p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
            <span className="text-xl">🎲</span> Create a new table
          </h2>

          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Your name
          </label>
          <input
            className="input mb-4"
            placeholder="e.g. Ada"
            maxLength={20}
            value={profile.name}
            onChange={(e) => saveProfileFields({ name: e.target.value })}
          />

          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Choose your token
          </label>
          <div className="mb-4">
            <AvatarPicker value={profile.avatar} onChange={(avatar) => saveProfileFields({ avatar })} />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Room name
              </label>
              <input
                className="input"
                placeholder="Friday night table"
                maxLength={24}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Seats
              </label>
              <select
                className="input"
                value={profile.maxPlayers}
                onChange={(e) => saveProfileFields({ maxPlayers: Number(e.target.value) })}
              >
                {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n} players
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <button className="btn btn-primary w-full py-3 text-base" disabled={busy || !connected} onClick={handleCreate}>
            Create room & get invite code
          </button>

          <p className="mt-3 text-center text-[11px] text-slate-500">
            Everyone starts with <b className="text-emerald-300">$1500</b>. Host controls the house
            rules inside the room.
          </p>
        </section>

        {/* -------------------------------- join ---------------------------------- */}
        <section className="panel p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
            <span className="text-xl">🔑</span> Join with an invite code
          </h2>

          <div className="flex flex-wrap gap-2">
            <input
              className="input min-w-0 flex-1 text-center font-mono text-xl uppercase tracking-[0.4em]"
              placeholder="ABC123"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              value={code}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                setCode(cleaned);
                setCopied(false);
                setCodeError(
                  cleaned && !CODE_RE.test(cleaned)
                    ? 'Code must be 4–6 letters/numbers (e.g. ABC123).'
                    : '',
                );
              }}
              onKeyDown={(e) => e.key === 'Enter' && CODE_RE.test(code) && handleJoin()}
              aria-label="Room code"
              aria-invalid={Boolean(codeError)}
            />
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              disabled={busy || joiningCode !== null}
              onClick={() => void handlePaste()}
              title="Paste the code your friend sent you"
            >
              📋 Paste
            </button>
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              disabled={busy || joiningCode !== null}
              onClick={() => void handleCopyCode()}
              title="Copy the code in this field"
            >
              {copied ? 'copied ✓' : '📄 Copy'}
            </button>
            <button
              className="btn btn-green shrink-0"
              disabled={busy || !CODE_RE.test(code) || joiningCode !== null}
              onClick={() => handleJoin()}
            >
              {joiningCode ? 'Joining…' : 'Join'}
            </button>
          </div>
          <p className="mt-2 min-h-[1rem] text-[11px]" role={codeError ? 'alert' : undefined}>
            {codeError ? (
              <span className="text-rose-300">{codeError}</span>
            ) : (
              <span className="text-slate-500">
                Paste the code your friend sent you, then press Join — works on any device.
              </span>
            )}
          </p>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Open tables nearby
              </h3>
              <span className="text-[11px] text-slate-500">auto-refreshes</span>
            </div>

            {openRooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-600/60 p-4 text-center text-sm text-slate-500">
                No open tables yet — create one and share the code!
              </div>
            ) : (
              <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                {openRooms.map((r) => (
                  <li
                    key={r.code}
                    className="flex items-center gap-3 rounded-xl border border-slate-600/40 bg-black/25 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{r.name}</div>
                      <div className="text-[11px] text-slate-400">
                        <span className="font-mono tracking-widest">{r.code}</span> ·{' '}
                        {r.playerCount}/{r.maxPlayers} seated
                      </div>
                    </div>
                    <div className="flex -space-x-1.5">
                      {r.players.slice(0, 4).map((p, i) => (
                        <span
                          key={i}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ring-2 ring-black/40"
                          style={{ background: p.color }}
                          title={p.name}
                        >
                          {emojiFor(p.avatar)}
                        </span>
                      ))}
                    </div>
                    <button
                      className="btn btn-ghost !px-3 !py-1.5 text-xs"
                      disabled={busy}
                      onClick={() => handleJoin(r.code)}
                    >
                      Join
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
              Recent matches
            </h3>
            {history.length === 0 ? (
              <div className="text-[12px] text-slate-500">
                Finished matches are stored in PostgreSQL and appear here.
              </div>
            ) : (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1 text-[12px]">
                {history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2 text-slate-300">
                    <span className="truncate">
                      <b className="font-mono">{h.code}</b> — {h.name}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {h.winner ? `🏆 ${h.winner}` : 'no winner'} · {h.players}p · {h.rounds} rounds
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <footer className="pb-6 text-center text-[11px] text-slate-500">
        <a href="/" className="underline decoration-slate-500/50 underline-offset-2 transition hover:text-slate-300">
          SUPER NOVA
        </a>{' '}
        · Real-time multiplayer board game · React + TypeScript + Socket.IO + PostgreSQL
      </footer>
    </div>
  );
}
