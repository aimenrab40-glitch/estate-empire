import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket';
import { C2S, S2C } from '@shared/types';
import { VoiceManager, supportedVoice } from '../lib/voice';

export interface AudioDeviceInfoLike {
  deviceId: string;
  label: string;
  kind: string;
}

export interface VoiceState {
  supported: boolean;
  enabled: boolean;
  muted: boolean;
  deafened: boolean;
  micVolume: number;
  speakerVolume: number;
  speaking: Set<string>;
  /** Player ids currently muted or deafened (their mic is silent). */
  mutedPeers: Set<string>;
  peers: Set<string>;
  peerStates: Map<string, RTCPeerConnectionState>;
  remoteStreams: Map<string, MediaStream>;
  error: string | null;
  micLevel: number;
  inputDevices: AudioDeviceInfoLike[];
  outputDevices: AudioDeviceInfoLike[];
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setMicVolume: (v: number) => void;
  setSpeakerVolume: (v: number) => void;
  setInputDeviceId: (id: string | null) => void;
  setOutputDeviceId: (id: string | null) => void;
  refreshDevices: () => Promise<void>;
  clearError: () => void;
}

const MIC_KEY = 'estate:micVolume';
const SPK_KEY = 'estate:speakerVolume';
const DEAFEN_KEY = 'estate:deafened';
const INPUT_KEY = 'estate:inputDevice';
const OUTPUT_KEY = 'estate:outputDevice';

/** Storage can throw in private/sandboxed contexts — never crash the game for it. */
function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useVoiceChat(roomCode: string | null, meId: string | null): VoiceState {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(() => lsGet(DEAFEN_KEY) === '1');
  const [inputDeviceId, setInputDeviceIdState] = useState<string | null>(() => lsGet(INPUT_KEY));
  const [outputDeviceId, setOutputDeviceIdState] = useState<string | null>(() => lsGet(OUTPUT_KEY));
  const [inputDevices, setInputDevices] = useState<AudioDeviceInfoLike[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDeviceInfoLike[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const prevMutedRef = useRef(false);
  const [micVolume, setMicVolumeState] = useState(() => {
    const v = Number(lsGet(MIC_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  });
  const [speakerVolume, setSpeakerVolumeState] = useState(() => {
    const v = Number(lsGet(SPK_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  });
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());
  const [peers, setPeers] = useState<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerStates, setPeerStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(false);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const managerRef = useRef<VoiceManager | null>(null);
  const supported = supportedVoice();

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(list.filter((d) => d.kind === 'audioinput'));
      setOutputDevices(list.filter((d) => d.kind === 'audiooutput'));
    } catch {
      /* ignore — labels/devices unavailable */
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const onChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [refreshDevices]);

  useEffect(() => {
    if (!enabled) return;
    void refreshDevices();
    const t = window.setInterval(() => {
      setMicLevel(managerRef.current?.getMicLevel() ?? 0);
    }, 150);
    return () => window.clearInterval(t);
  }, [enabled, refreshDevices]);

  // Broadcast my mute/deafen state so everyone else shows the red mic badge.
  useEffect(() => {
    if (!enabled) return;
    socket.emit(C2S.voiceState, { muted, deafened });
  }, [enabled, muted, deafened]);

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
    const applyState = (peerId: string, muted: boolean, deafened: boolean) => {
      if (!peerId || peerId === meId) return;
      setMutedPeers((prev) => {
        const next = new Set(prev);
        if (muted || deafened) next.add(peerId);
        else next.delete(peerId);
        return next;
      });
    };
    const onVoiceState = (p: { peerId: string; muted?: boolean; deafened?: boolean }) => {
      if (!p?.peerId) return;
      applyState(p.peerId, Boolean(p.muted), Boolean(p.deafened));
    };
    const onVoiceStates = (p: { states?: { peerId: string; muted?: boolean; deafened?: boolean }[] }) => {
      const next = new Set<string>();
      for (const s of p?.states ?? []) {
        if (s?.peerId && s.peerId !== meId && (s.muted || s.deafened)) next.add(s.peerId);
      }
      setMutedPeers(next);
    };

    socket.on(S2C.voicePeerList, onPeerList);
    socket.on(S2C.voicePeerJoined, onPeerJoined);
    socket.on(S2C.voicePeerLeft, onPeerLeft);
    socket.on(S2C.voiceState, onVoiceState);
    socket.on(S2C.voiceStates, onVoiceStates);
    socket.on(S2C.voiceOffer, onOffer);
    socket.on(S2C.voiceAnswer, onAnswer);
    socket.on(S2C.voiceIce, onIce);

    return () => {
      socket.off(S2C.voicePeerList, onPeerList);
      socket.off(S2C.voicePeerJoined, onPeerJoined);
      socket.off(S2C.voicePeerLeft, onPeerLeft);
      socket.off(S2C.voiceState, onVoiceState);
      socket.off(S2C.voiceStates, onVoiceStates);
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
    if (inputDeviceId) void m.setInputDevice(inputDeviceId);
    m.setDeafened(lsGet(DEAFEN_KEY) === '1');
    managerRef.current = m;
    return m;
  }, [roomCode, meId, micVolume, speakerVolume, inputDeviceId]);

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
      void refreshDevices();
    }
    return ok;
  }, [ensureManager, refreshDevices]);

  const disable = useCallback(async () => {
    const m = managerRef.current;
    if (m) await m.disable();
    setEnabled(false);
    setPeers(new Set());
    setRemoteStreams(new Map());
    setSpeaking(new Set());
    setMutedPeers(new Set());
  }, []);

  const toggleMute = useCallback(() => {
    const m = managerRef.current;
    if (!m || !enabled || deafened) return;
    const next = !muted;
    m.setMuted(next);
    setMuted(next);
  }, [enabled, muted, deafened]);

  const toggleDeafen = useCallback(async () => {
    if (!enabled) {
      // Joining voice with headphones behaves like Discord: un-deafen first.
      const ok = await enable();
      return ok;
    }
    const m = managerRef.current;
    const next = !deafened;
    if (next) {
      prevMutedRef.current = muted;
      setMuted(true);
      m?.setMuted(true);
    } else {
      const restore = prevMutedRef.current;
      setMuted(restore);
      m?.setMuted(restore);
    }
    setDeafened(next);
    lsSet(DEAFEN_KEY, next ? '1' : '0');
    m?.setDeafened(next);
  }, [enabled, deafened, muted, enable]);

  const setInputDeviceId = useCallback(
    (id: string | null) => {
      setInputDeviceIdState(id);
      if (id) lsSet(INPUT_KEY, id);
      else lsDel(INPUT_KEY);
      void managerRef.current?.setInputDevice(id);
      void refreshDevices();
    },
    [refreshDevices],
  );

  const setOutputDeviceId = useCallback((id: string | null) => {
    setOutputDeviceIdState(id);
    if (id) lsSet(OUTPUT_KEY, id);
    else lsDel(OUTPUT_KEY);
  }, []);

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
    deafened,
    micVolume,
    speakerVolume,
    speaking,
    mutedPeers,
    peers,
    peerStates,
    remoteStreams,
    error,
    micLevel,
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    enable,
    disable,
    toggleMute,
    toggleDeafen,
    setMicVolume,
    setSpeakerVolume,
    setInputDeviceId,
    setOutputDeviceId,
    refreshDevices,
    clearError,
  };
}
