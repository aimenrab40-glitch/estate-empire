import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket';
import { C2S, S2C } from '@shared/types';
import { VoiceManager, supportedVoice } from '../lib/voice';

export interface VoiceState {
  supported: boolean;
  enabled: boolean;
  muted: boolean;
  micVolume: number;
  speakerVolume: number;
  speaking: Set<string>;
  peers: Set<string>;
  peerStates: Map<string, RTCPeerConnectionState>;
  remoteStreams: Map<string, MediaStream>;
  error: string | null;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  toggleMute: () => void;
  setMicVolume: (v: number) => void;
  setSpeakerVolume: (v: number) => void;
  clearError: () => void;
}

const MIC_KEY = 'estate:micVolume';
const SPK_KEY = 'estate:speakerVolume';

export function useVoiceChat(roomCode: string | null, meId: string | null): VoiceState {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micVolume, setMicVolumeState] = useState(() => {
    const v = Number(localStorage.getItem(MIC_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  });
  const [speakerVolume, setSpeakerVolumeState] = useState(() => {
    const v = Number(localStorage.getItem(SPK_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  });
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [peers, setPeers] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerStates, setPeerStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(false);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const managerRef = useRef<VoiceManager | null>(null);
  const supported = supportedVoice();

  // Keep volume state in sync with the manager.
  useEffect(() => {
    if (managerRef.current) managerRef.current.setMicVolume(micVolume);
  }, [micVolume]);
  useEffect(() => {
    if (managerRef.current) managerRef.current.setSpeakerVolume(speakerVolume);
  }, [speakerVolume]);

  // Signaling listeners.
  useEffect(() => {
    if (!roomCode || !meId) return;
    const onPeerList = (ids: string[]) => {
      managerRef.current?.handlePeerList(ids ?? []);
    };
    const onPeerJoined = (p: { peerId: string }) => {
      if (!p?.peerId) return;
      managerRef.current?.handlePeerJoined(p.peerId);
    };
    const onPeerLeft = (p: { peerId: string }) => {
      if (!p?.peerId) return;
      managerRef.current?.handlePeerLeft(p.peerId);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(p.peerId);
        return next;
      });
      setPeers((prev) => {
        const next = new Set(prev);
        next.delete(p.peerId);
        return next;
      });
    };
    const onOffer = (p: { from: string; sdp: any }) => {
      if (!p?.from || !p.sdp) return;
      managerRef.current?.handleOffer(p.from, p.sdp);
    };
    const onAnswer = (p: { from: string; sdp: any }) => {
      if (!p?.from || !p.sdp) return;
      managerRef.current?.handleAnswer(p.from, p.sdp);
    };
    const onIce = (p: { from: string; candidate: any }) => {
      if (!p?.from || !p.candidate) return;
      managerRef.current?.handleIce(p.from, p.candidate);
    };

    socket.on(S2C.voicePeerList, onPeerList);
    socket.on(S2C.voicePeerJoined, onPeerJoined);
    socket.on(S2C.voicePeerLeft, onPeerLeft);
    socket.on(S2C.voiceOffer, onOffer);
    socket.on(S2C.voiceAnswer, onAnswer);
    socket.on(S2C.voiceIce, onIce);

    return () => {
      socket.off(S2C.voicePeerList, onPeerList);
      socket.off(S2C.voicePeerJoined, onPeerJoined);
      socket.off(S2C.voicePeerLeft, onPeerLeft);
      socket.off(S2C.voiceOffer, onOffer);
      socket.off(S2C.voiceAnswer, onAnswer);
      socket.off(S2C.voiceIce, onIce);
    };
  }, [roomCode, meId]);

  const ensureManager = useCallback(() => {
    if (managerRef.current) return managerRef.current;
    if (!roomCode || !meId) return null;
    const m = new VoiceManager({
      roomCode,
      playerId: meId,
      onRemoteStream: (pid, stream) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(pid, stream);
          return next;
        });
        setPeers((prev) => {
          const next = new Set(prev);
          next.add(pid);
          return next;
        });
      },
      onPeerLeft: (pid) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(pid);
          return next;
        });
        setPeers((prev) => {
          const next = new Set(prev);
          next.delete(pid);
          return next;
        });
      },
      onSpeakingChange: setSpeaking,
      onError: setError,
      onEnabledChange: setEnabled,
      onPeerCountChange: () => {},
      onPeerStateChange: (pid, st) => {
        setPeerStates((prev) => {
          const next = new Map(prev);
          next.set(pid, st);
          return next;
        });
      },
    });
    m.setMicVolume(micVolume);
    m.setSpeakerVolume(speakerVolume);
    managerRef.current = m;
    return m;
  }, [roomCode, meId, micVolume, speakerVolume]);

  // Re-establish voice after a socket reconnect (server restart / network drop).
  useEffect(() => {
    if (!roomCode || !meId) return;
    const onConnect = async () => {
      if (!enabledRef.current) return;
      const m = managerRef.current;
      if (m) {
        await m.disable().catch(() => undefined);
        managerRef.current = null;
      }
      setPeers(new Set());
      setRemoteStreams(new Map());
      setSpeaking(new Set());
      setPeerStates(new Map());
      const nm = ensureManager();
      if (nm) {
        const ok = await nm.enable();
        if (ok) {
          setEnabled(true);
          setError(null);
        }
      }
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [roomCode, meId, ensureManager]);

  const enable = useCallback(async () => {
    setError(null);
    const m = ensureManager();
    if (!m) {
      setError('Join a room first.');
      return false;
    }
    const ok = await m.enable();
    if (ok) {
      setMuted(m.isMuted);
      setEnabled(true);
    }
    return ok;
  }, [ensureManager]);

  const disable = useCallback(async () => {
    const m = managerRef.current;
    if (m) await m.disable();
    setEnabled(false);
    setPeers(new Set());
    setRemoteStreams(new Map());
    setSpeaking(new Set());
  }, []);

  const toggleMute = useCallback(() => {
    const m = managerRef.current;
    if (!m || !enabled) return;
    const next = !muted;
    m.setMuted(next);
    setMuted(next);
  }, [enabled, muted]);

  const setMicVolume = useCallback((v: number) => {
    setMicVolumeState(v);
    localStorage.setItem(MIC_KEY, String(v));
    managerRef.current?.setMicVolume(v);
  }, []);

  const setSpeakerVolume = useCallback((v: number) => {
    setSpeakerVolumeState(v);
    localStorage.setItem(SPK_KEY, String(v));
    managerRef.current?.setSpeakerVolume(v);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Tear down when leaving the room / unmounting.
  useEffect(() => {
    return () => {
      const m = managerRef.current;
      if (m) {
        m.disable().catch(() => undefined);
        managerRef.current = null;
      }
    };
  }, [roomCode]);

  return {
    supported,
    enabled,
    muted,
    micVolume,
    speakerVolume,
    speaking,
    peers,
    peerStates,
    remoteStreams,
    error,
    enable,
    disable,
    toggleMute,
    setMicVolume,
    setSpeakerVolume,
    clearError,
  };
}
