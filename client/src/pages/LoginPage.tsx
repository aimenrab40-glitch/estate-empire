import { useEffect, useState } from 'react';
import { ensureGuest, fetchAuthConfig } from '../lib/auth';

/**
 * SUPER NOVA sign-in screen. Accounts are OAuth-based (Google required,
 * Discord optional). No local passwords are stored anywhere.
 */
export default function LoginPage() {
  const [cfg, setCfg] = useState<{ google: boolean; discord: boolean; requireAuth: boolean }>({
    google: false,
    discord: false,
    requireAuth: true,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAuthConfig().then(setCfg).catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err === 'google') setError('Google sign-in failed — please try again.');
    if (err === 'discord') setError('Discord sign-in failed — please try again.');
  }, []);

  return (
    <div className="sn-login mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <img
          src="/supernova-favicon.svg"
          alt="SUPER NOVA logo"
          className="sn-logo-glow h-24 w-24 rounded-3xl"
        />
        <div className="text-xs font-bold uppercase tracking-[0.4em] text-red-400">
          SUPER NOVA COMMUNITY
        </div>
        <h1 className="sn-title text-4xl font-black text-white">
          SUPER <span className="text-red-500">NOVA</span>
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-slate-400">
          Mafia online with friends — step into the 3D table, hide your role,
          protect the town and take down the Mafia. Sign in to play.
        </p>
      </div>

      <div className="panel w-full max-w-sm space-y-3 p-5">
        <h2 className="text-center text-sm font-black uppercase tracking-widest text-slate-300">
          Sign in to play
        </h2>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-center text-xs text-rose-200">
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn w-full bg-white py-3 text-base text-slate-900 hover:brightness-95 disabled:opacity-50"
          disabled={!cfg.google}
          onClick={() => {
            window.location.href = '/auth/google';
          }}
        >
          <span className="text-lg font-black">G</span>
          <span>Continue with Google</span>
        </button>

        <button
          type="button"
          className="btn w-full py-3 text-base disabled:opacity-50"
          style={{ background: '#5865F2', color: '#fff', borderColor: '#4752c4' }}
          disabled={!cfg.discord}
          onClick={() => {
            window.location.href = '/auth/discord';
          }}
        >
          <span className="text-lg">🎮</span>
          <span>Link Discord (optional)</span>
        </button>

        <button
          type="button"
          className="btn btn-ghost w-full py-3 text-base"
          onClick={() => {
            ensureGuest();
            window.location.reload();
          }}
        >
          <span className="text-lg">🧑‍🤝‍🧑</span>
          <span>Play as Guest</span>
        </button>

        {!cfg.google && !cfg.discord && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-center text-[11px] leading-relaxed text-amber-200">
            يبدو أن مفاتيح Google OAuth لم تُضبط على الخادم بعد. اطلب من إدارة
            SUPER NOVA إعادة المحاولة بعد الإعداد.
          </p>
        )}
        {cfg.discord && !cfg.google && (
          <p className="text-center text-[11px] text-slate-500">
            Discord sign-in is available while Google is still being configured.
          </p>
        )}

        <div className="flex items-center justify-center gap-4 pt-1 text-[11px] text-slate-500">
          <span>🔒 Accounts stored securely</span>
          <span>📱 Phone + desktop</span>
        </div>
        <div className="text-center text-[10px] text-slate-600">
          {cfg.google
            ? 'Your Google profile picture travels with you into every room — or play instantly as a guest.'
            : 'No account needed: play as a guest, or sign in with Google when it is configured.'}
        </div>
      </div>

      <footer className="text-center text-[11px] text-slate-600">
        SUPER NOVA · Real-time multiplayer Mafia · Socket.IO + PostgreSQL
      </footer>
    </div>
  );
}
