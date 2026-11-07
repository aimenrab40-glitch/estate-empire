import { useEffect, useRef } from 'react';
import { emojiFor } from '@shared/avatars';
import type { PublicPlayer } from '@shared/types';
import type { VoiceState } from '../hooks/useVoiceChat';

interface VoiceChatProps {
  state: VoiceState;
  players: PublicPlayer[];
  meId: string | null;
}

export default function VoiceChat({ state, players, meId }: VoiceChatProps) {
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Attach remote streams to <audio> elements and apply speaker volume.
  useEffect(() => {
    for (const [pid, stream] of state.remoteStreams) {
      const el = audioRefs.current.get(pid);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.volume = state.speakerVolume;
        // Autoplay may be blocked until a user gesture; the mic toggle is a gesture.
        el.play().catch(() => {
          /* ignore — will retry on next interaction */
        });
      }
      if (el) el.volume = state.speakerVolume;
    }
    // Remove stale audio elements.
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
  }, [state.remoteStreams, state.speakerVolume]);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Player';

  return (
    <section className="panel flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">
          Voice chat
        </h3>
        <span className="text-[10px] text-slate-500">
          {state.enabled
            ? `${state.peers.size + 1} connected`
            : state.supported
              ? 'off'
              : 'unsupported'}
        </span>
      </div>

      {state.error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-1.5 text-[11px] text-rose-200">
          {state.error}
          <button
            className="ml-2 underline"
            onClick={state.clearError}
            aria-label="Dismiss voice error"
          >
            dismiss
          </button>
        </div>
      )}

      {!state.supported && (
        <p className="text-[11px] text-slate-500">
          This browser doesn't support WebRTC voice chat. Try Chrome, Edge or Safari.
        </p>
      )}

      {state.supported && (
        <>
          <div className="flex items-center gap-2">
            <button
              className={`btn ${state.enabled ? 'btn-green' : 'btn-primary'} flex-1 !py-2 text-sm`}
              onClick={() => (state.enabled ? state.disable() : state.enable())}
              disabled={!state.enabled && !state.supported}
              title={state.enabled ? 'Leave voice chat' : 'Enable microphone'}
            >
              {state.enabled ? (state.muted ? '🔇 Unmute' : '🎤 Mute') : '🎤 Enable mic'}
            </button>
            {state.enabled && (
              <button
                className="btn btn-ghost !px-3 !py-2 text-sm"
                onClick={state.toggleMute}
                title={state.muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {state.muted ? '🔇' : '🎤'}
              </button>
            )}
          </div>

          {state.enabled && (
            <>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-16 shrink-0">Mic</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state.micVolume}
                    onChange={(e) => state.setMicVolume(Number(e.target.value))}
                    className="flex-1 accent-amber-400"
                    aria-label="Microphone volume"
                  />
                  <span className="w-8 text-right font-mono text-[10px]">
                    {Math.round(state.micVolume * 100)}%
                  </span>
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-16 shrink-0">Speaker</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state.speakerVolume}
                    onChange={(e) => state.setSpeakerVolume(Number(e.target.value))}
                    className="flex-1 accent-amber-400"
                    aria-label="Speaker volume"
                  />
                  <span className="w-8 text-right font-mono text-[10px]">
                    {Math.round(state.speakerVolume * 100)}%
                  </span>
                </label>
              </div>

              <div className="min-h-0 flex-1">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  In voice ({state.peers.size + 1})
                </div>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        state.speaking.has(meId ?? '') ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                      }`}
                    />
                    <span className="truncate text-[11px] font-semibold text-slate-200">
                      You {state.muted ? '(muted)' : ''}
                    </span>
                  </li>
                  {[...state.remoteStreams.keys()].map((pid) => {
                    const connState = state.peerStates.get(pid);
                    return (
                      <li key={pid} className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            state.speaking.has(pid) ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                          }`}
                        />
                        <span className="truncate text-[11px] font-semibold text-slate-200">
                          {nameOf(pid)}
                        </span>
                        {connState && connState !== 'connected' && (
                          <span className="ml-auto text-[9px] uppercase tracking-wider text-amber-300">
                            {connState}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </>
      )}

      {/* Hidden audio elements for remote streams. */}
      {[...state.remoteStreams.entries()].map(([pid, stream]) => (
        <audio
          key={pid}
          ref={(el) => {
            if (el) {
              audioRefs.current.set(pid, el);
              if (el.srcObject !== stream) {
                el.srcObject = stream;
                el.volume = state.speakerVolume;
                el.play().catch(() => undefined);
              }
            } else {
              audioRefs.current.delete(pid);
            }
          }}
          autoPlay
          playsInline
          muted={false}
        />
      ))}
    </section>
  );
}
