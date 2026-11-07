import { useEffect, useRef, useState } from 'react';
import { emojiFor } from '@shared/avatars';
import type { PublicPlayer } from '@shared/types';
import type { VoiceState } from '../hooks/useVoiceChat';

/**
 * Discord-style voice control bar (bottom of the room UI).
 * Real WebRTC voice via useVoiceChat — this bar only renders controls;
 * the <audio> elements here play the remote peer streams.
 */

type Menu = 'mic' | 'phones' | 'settings' | null;

/* ---------------------------------- icons ---------------------------------- */
function Ico({ d, slash = false }: { d: string; slash?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
      {slash && <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2.2" />}
    </svg>
  );
}
const Mic = () => (
  <Ico d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
);
const MicOff = () => (
  <Ico d="M12 2a3 3 0 0 0-3 3v5M15 11V5M19 10v1a7 7 0 0 1-4 6.3M5 11v0a7 7 0 0 0 3.6 6.2M12 18v4M8 22h8M4 4l16 16" />
);
const Headphones = () => (
  <Ico d="M4 15v-2a8 8 0 0 1 16 0v2M4 15h3v5H4zM17 15h3v5h-3zM20 20a4 4 0 0 1-4 2h-2" />
);
const HeadphonesOff = () => (
  <Ico d="M4 15v-2a8 8 0 0 1 13.5-6.4M20 15v-2a8 8 0 0 0-2-5.2M4 15h3v5H4zM17 15h3v5h-3zM20 20a4 4 0 0 1-4 2M4 4l16 16" />
);
const Gear = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
    <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4L19.4 13ZM13 15.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
  </svg>
);
const Chevron = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const Check = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#23a55a]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const DISCORD_BG = '#1e1f22';
const DISCORD_PANEL = '#111214';
const RED = '#f23f43';
const RED_BG = '#592d31';

interface VoiceChatProps {
  state: VoiceState;
  players: PublicPlayer[];
  meId: string | null;
  me?: PublicPlayer | null;
}

export default function VoiceChat({ state, players, meId, me }: VoiceChatProps) {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [menu, setMenu] = useState<Menu>(null);
  const mePlayer = me ?? players.find((p) => p.id === meId) ?? null;
  const myName = mePlayer?.name ?? 'You';
  const iAmSpeaking = state.speaking.has(meId ?? '');

  const applyOutput = (el: HTMLAudioElement | null) => {
    if (!el) return;
    const anyEl = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof anyEl.setSinkId === 'function') {
      anyEl.setSinkId(state.outputDeviceId ?? '').catch(() => undefined);
    }
  };

  // Attach remote streams to <audio> elements and apply speaker volume / output device.
  useEffect(() => {
    for (const [pid, stream] of state.remoteStreams) {
      const el = audioRefs.current.get(pid);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => undefined);
      }
      if (el) {
        el.volume = state.deafened ? 0 : state.speakerVolume;
        applyOutput(el);
      }
    }
    for (const pid of [...audioRefs.current.keys()]) {
      if (!state.remoteStreams.has(pid)) {
        const el = audioRefs.current.get(pid);
        if (el) {
          el.srcObject = null;
          el.remove();
        }
        audioRefs.current.delete(pid);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.remoteStreams, state.speakerVolume, state.deafened, state.outputDeviceId]);

  const micSilent = !state.enabled || state.muted || state.deafened;
  const statusText = !state.enabled
    ? 'Voice disconnected'
    : state.deafened
      ? 'Deafened'
      : state.muted
        ? 'Muted'
        : 'Voice connected';
  const statusColor = !state.enabled ? '#949ba4' : state.deafened || state.muted ? RED : '#23a55a';
  const statusDot = !state.enabled ? '#4e5058' : state.deafened || state.muted ? RED : '#23a55a';

  const inputLabel = (d: { deviceId: string; label: string }, i: number) => d.label || `Microphone ${i + 1}`;
  const outputLabel = (d: { deviceId: string; label: string }, i: number) => d.label || `Speaker ${i + 1}`;

  const deviceItem = (
    active: boolean,
    label: string,
    onPick: () => void,
  ) => (
    <button
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-[#dbdee1] hover:bg-[#35373c]"
      onClick={onPick}
    >
      <span className="w-4 shrink-0">{active && <Check />}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );

  const btnBase =
    'flex h-10 items-center justify-center transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

  return (
    <div className="relative" aria-label="Voice controls">
      {/* Hidden audio elements for remote streams. */}
      {[...state.remoteStreams.entries()].map(([pid, stream]) => (
        <audio
          key={pid}
          ref={(el) => {
            if (el) {
              audioRefs.current.set(pid, el);
              if (el.srcObject !== stream) {
                el.srcObject = stream;
                el.volume = state.deafened ? 0 : state.speakerVolume;
                applyOutput(el);
                el.play().catch(() => undefined);
              }
            } else {
              audioRefs.current.delete(pid);
            }
          }}
          autoPlay
          playsInline
          muted={state.deafened}
        />
      ))}

      {state.error && (
        <div className="absolute bottom-full right-0 z-30 mb-2 flex max-w-sm items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-white" style={{ background: RED }}>
          <span className="min-w-0 flex-1">{state.error}</span>
          <button className="shrink-0 underline" onClick={state.clearError} aria-label="Dismiss voice error">✕</button>
        </div>
      )}

      {menu && <button className="fixed inset-0 z-20 cursor-default" aria-label="Close voice menu" onClick={() => setMenu(null)} />}

      <div
        className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        style={{ background: DISCORD_BG }}
      >
        {/* ---- player identity ---- */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative shrink-0">
            {mePlayer?.avatarUrl ? (
              <img
                src={mePlayer.avatarUrl}
                alt=""
                className={`h-10 w-10 rounded-full object-cover transition-shadow ${iAmSpeaking ? 'ring-2 ring-[#23a55a]' : ''}`}
              />
            ) : (
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full text-xl ring-2 ${iAmSpeaking ? 'ring-[#23a55a]' : 'ring-white/15'}`}
                style={{ background: mePlayer?.color ?? '#334155' }}
                aria-hidden
              >
                {emojiFor(mePlayer?.avatar ?? 'default')}
              </span>
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2"
              style={{ background: statusDot, borderColor: DISCORD_BG }}
              title={statusText}
            />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-bold text-white">{myName}</div>
            <div className="truncate text-[12px]" style={{ color: statusColor }}>
              {state.enabled ? `${statusText}${state.peers.size ? ` · ${state.peers.size + 1} in voice` : ''}` : statusText}
            </div>
          </div>
        </div>

        {!state.supported && (
          <span className="ml-auto text-[12px] text-[#949ba4]">WebRTC voice is not supported in this browser.</span>
        )}

        {/* ---- controls ---- */}
        <div className="ml-auto flex items-center gap-2">
          {/* Microphone (Mute/Unmute) + device chevron */}
          <div className="flex overflow-hidden rounded-lg" role="group" aria-label="Microphone">
            <button
              className={`${btnBase} w-12 ${micSilent ? 'text-white' : 'text-[#dbdee1] hover:bg-white/10'}`}
              style={micSilent ? { background: RED_BG } : undefined}
              onClick={() => (state.enabled ? state.toggleMute() : void state.enable())}
              aria-pressed={micSilent}
              title={!state.enabled ? 'Join voice (enable microphone)' : state.deafened ? 'Deafened — undeafen to unmute' : state.muted ? 'Unmute' : 'Mute'}
            >
              {micSilent ? <MicOff /> : <Mic />}
              <span className="sr-only">{state.enabled ? (state.muted ? 'Unmute microphone' : 'Mute microphone') : 'Enable microphone'}</span>
            </button>
            <button
              className={`${btnBase} w-6 border-l border-black/25 ${micSilent ? 'text-white' : 'text-[#b5bac1] hover:bg-white/10'}`}
              style={micSilent ? { background: RED_BG } : undefined}
              onClick={() => setMenu(menu === 'mic' ? null : 'mic')}
              aria-label="Choose microphone"
              aria-expanded={menu === 'mic'}
              title="Choose microphone"
            >
              <Chevron />
            </button>
          </div>

          {/* Headphones (Deafen/Undeafen) + device chevron */}
          <div className="flex overflow-hidden rounded-lg" role="group" aria-label="Headphones">
            <button
              className={`${btnBase} w-12 ${state.deafened ? 'text-white' : 'text-[#dbdee1] hover:bg-white/10'}`}
              style={state.deafened ? { background: RED_BG } : undefined}
              onClick={() => void state.toggleDeafen()}
              aria-pressed={state.deafened}
              title={!state.enabled ? 'Join voice' : state.deafened ? 'Undeafen' : 'Deafen'}
            >
              {state.deafened ? <HeadphonesOff /> : <Headphones />}
              <span className="sr-only">{state.deafened ? 'Undeafen' : 'Deafen'}</span>
            </button>
            <button
              className={`${btnBase} w-6 border-l border-black/25 ${state.deafened ? 'text-white' : 'text-[#b5bac1] hover:bg-white/10'}`}
              style={state.deafened ? { background: RED_BG } : undefined}
              onClick={() => setMenu(menu === 'phones' ? null : 'phones')}
              aria-label="Choose output device"
              aria-expanded={menu === 'phones'}
              title="Choose output device"
            >
              <Chevron />
            </button>
          </div>

          {/* Settings */}
          <button
            className={`${btnBase} w-10 rounded-lg ${menu === 'settings' ? 'bg-white/15 text-white' : 'text-[#b5bac1] hover:bg-white/10 hover:text-white'}`}
            onClick={() => setMenu(menu === 'settings' ? null : 'settings')}
            aria-label="Voice settings"
            aria-expanded={menu === 'settings'}
            title="Voice settings"
          >
            <Gear />
          </button>
        </div>

        {/* ---- microphone device menu ---- */}
        {menu === 'mic' && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-xl p-2 shadow-2xl" style={{ background: DISCORD_PANEL }}>
            <div className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-[#b5bac1]">Input device</div>
            {deviceItem(!state.inputDeviceId, 'Default microphone', () => state.setInputDeviceId(null))}
            {state.inputDevices.map((d, i) =>
              deviceItem(state.inputDeviceId === d.deviceId, inputLabel(d, i), () => state.setInputDeviceId(d.deviceId)),
            )}
            {state.inputDevices.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-[#80848e]">Device names appear after the mic is enabled once.</p>
            )}
            <div className="mt-1 border-t border-white/10 px-2 pt-2 text-[11px] text-[#80848e]">
              {state.enabled ? 'Switching is instant — no reconnect.' : 'Join voice to start using a microphone.'}
            </div>
          </div>
        )}

        {/* ---- output device menu ---- */}
        {menu === 'phones' && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-xl p-2 shadow-2xl" style={{ background: DISCORD_PANEL }}>
            <div className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-[#b5bac1]">Output device</div>
            {deviceItem(!state.outputDeviceId, 'Default output', () => state.setOutputDeviceId(null))}
            {state.outputDevices.map((d, i) =>
              deviceItem(state.outputDeviceId === d.deviceId, outputLabel(d, i), () => state.setOutputDeviceId(d.deviceId)),
            )}
            {state.outputDevices.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-[#80848e]">Device names appear after the mic is enabled once.</p>
            )}
          </div>
        )}

        {/* ---- settings panel ---- */}
        {menu === 'settings' && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl p-4 shadow-2xl" style={{ background: DISCORD_PANEL }}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-white">Voice Settings</h3>
              <button className="text-[#b5bac1] hover:text-white" onClick={() => setMenu(null)} aria-label="Close settings">✕</button>
            </div>

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#b5bac1]" htmlFor="vc-input">Input device</label>
            <select
              id="vc-input"
              className="mb-3 w-full rounded-md bg-[#1e1f22] px-2 py-2 text-[13px] text-[#dbdee1] outline-none"
              value={state.inputDeviceId ?? ''}
              onChange={(e) => state.setInputDeviceId(e.target.value || null)}
            >
              <option value="">Default microphone</option>
              {state.inputDevices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{inputLabel(d, i)}</option>
              ))}
            </select>

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#b5bac1]" htmlFor="vc-micvol">Input volume</label>
            <div className="mb-1 flex items-center gap-2">
              <input
                id="vc-micvol" type="range" min={0} max={1} step={0.01} value={state.micVolume}
                onChange={(e) => state.setMicVolume(Number(e.target.value))}
                className="flex-1 accent-[#5865f2]" aria-label="Microphone volume"
              />
              <span className="w-10 text-right font-mono text-[11px] text-[#b5bac1]">{Math.round(state.micVolume * 100)}%</span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#1e1f22]" title="Mic test">
              <div
                className="h-full rounded-full bg-[#23a55a] transition-[width] duration-150"
                style={{ width: `${Math.min(100, Math.round(state.micLevel * 300))}%` }}
              />
            </div>

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#b5bac1]" htmlFor="vc-output">Output device</label>
            <select
              id="vc-output"
              className="mb-3 w-full rounded-md bg-[#1e1f22] px-2 py-2 text-[13px] text-[#dbdee1] outline-none"
              value={state.outputDeviceId ?? ''}
              onChange={(e) => state.setOutputDeviceId(e.target.value || null)}
            >
              <option value="">Default output</option>
              {state.outputDevices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{outputLabel(d, i)}</option>
              ))}
            </select>

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#b5bac1]" htmlFor="vc-spkvol">Output volume</label>
            <div className="mb-4 flex items-center gap-2">
              <input
                id="vc-spkvol" type="range" min={0} max={1} step={0.01} value={state.speakerVolume} disabled={state.deafened}
                onChange={(e) => state.setSpeakerVolume(Number(e.target.value))}
                className="flex-1 accent-[#5865f2] disabled:opacity-40" aria-label="Speaker volume"
              />
              <span className="w-10 text-right font-mono text-[11px] text-[#b5bac1]">{Math.round(state.speakerVolume * 100)}%</span>
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 rounded-md px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: state.muted ? RED_BG : '#2b2d31' }}
                onClick={() => state.enabled && state.toggleMute()}
                disabled={!state.enabled || state.deafened}
                title={state.muted ? 'Unmute' : 'Mute'}
              >
                {state.muted ? 'Unmute mic' : 'Mute mic'}
              </button>
              <button
                className="flex-1 rounded-md px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: state.deafened ? RED_BG : '#2b2d31' }}
                onClick={() => void state.toggleDeafen()}
                title={state.deafened ? 'Undeafen' : 'Deafen'}
              >
                {state.deafened ? 'Undeafen' : 'Deafen'}
              </button>
            </div>
            {state.deafened && <p className="mt-2 text-[11px]" style={{ color: RED }}>Deafened — you hear nothing and your mic is silent.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
