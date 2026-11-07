import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  C2S,
  S2C,
  type AckResponse,
  type ChatMessage,
  type PrivateProfile,
  type PublicPlayer,
  type RoomState,
  type Rules,
} from '@shared/types';
import { connectSocket, socket } from '../lib/socket';
import {
  DEFAULT_PROFILE,
  clearSession,
  loadProfile,
  loadSession,
  saveProfile,
  saveSession,
  type Profile,
} from '../lib/session';

interface Toast {
  id: number;
  kind: 'error' | 'info';
  text: string;
}

interface SessionApi {
  room: RoomState | null;
  meId: string | null;
  me: PublicPlayer | null;
  /** Private overhead profile — local only, never replicated (own username + secret role). */
  privateProfile: PrivateProfile | null;
  profile: Profile;
  chat: ChatMessage[];
  toast: Toast | null;
  connected: boolean;
  busy: boolean;
  saveProfileFields: (patch: Partial<Profile>) => void;
  createRoom: (opts?: { roomName?: string; rules?: Partial<Rules> }) => Promise<string | null>;
  joinRoom: (code: string, opts?: { playerId?: string }) => Promise<string | null>;
  leaveRoom: () => Promise<void>;
  start: () => Promise<boolean>;
  roll: () => Promise<boolean>;
  buy: () => Promise<boolean>;
  pass: () => Promise<boolean>;
  endTurn: () => Promise<boolean>;
  payBail: () => Promise<boolean>;
  bid: (amount: number) => Promise<boolean>;
  build: (tile: number) => Promise<boolean>;
  sellBuilding: (tile: number) => Promise<boolean>;
  mortgage: (tile: number) => Promise<boolean>;
  unmortgage: (tile: number) => Promise<boolean>;
  setRules: (patch: Partial<Rules>) => Promise<boolean>;
  kick: (targetId: string) => Promise<boolean>;
  sendChat: (text: string) => void;
  dismissToast: () => void;
}

const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

let toastSeq = 1;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [privateProfile, setPrivateProfile] = useState<PrivateProfile | null>(null);
  const privateProfileRef = useRef<PrivateProfile | null>(null);
  privateProfileRef.current = privateProfile;
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(loadSession());
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const joiningRef = useRef(false);

  const showToast = useCallback((kind: 'error' | 'info', text: string) => {
    setToast({ id: toastSeq++, kind, text });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const saveProfileFields = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      saveProfile(next);
      return next;
    });
  }, []);

  /* ---------------------------- socket wiring ---------------------------- */

  const initialConnectHandled = useRef(false);

  useEffect(() => {
    const onState = (next: RoomState) => {
      setRoom(next);
      if (sessionRef.current && sessionRef.current.code === next.code) {
        // keep the stored seat id in sync with the server truth
        const stored = sessionRef.current;
        const stillMine = next.players.some((p) => p.id === stored.playerId);
        if (!stillMine && next.game?.phase === 'lobby') {
          clearSession();
          sessionRef.current = null;
          setMeId(null);
        }
      }
    };
    const onChat = (msg: ChatMessage) => setChat((prev) => [...prev, msg].slice(-200));
    const onNotice = (n: { type?: string; message?: string }) => {
      if (n?.message) showToast(n.type === 'error' ? 'error' : 'info', n.message);
    };
    // PRIVATE overhead profile: server unicasts only to the owning socket.
    // Defensive check — ignore anything that is not addressed to me.
    const onPrivateProfile = (next: PrivateProfile) => {
      const myId = sessionRef.current?.playerId;
      if (!next || !myId || next.playerId !== myId) return;
      setPrivateProfile(next);
    };
    const onConnect = () => {
      setConnected(true);
      // The very first connect is handled by the mount-time join block below.
      // Every subsequent connect is a transport reconnect — re-join the room so the
      // server re-adds this socket to the Socket.IO room and pushes fresh state.
      if (!initialConnectHandled.current) {
        initialConnectHandled.current = true;
        return;
      }
      const s = sessionRef.current;
      if (s && !joiningRef.current) {
        socket.emit(
          C2S.join,
          { code: s.code, playerId: s.playerId },
          (res: AckResponse<{ code: string; playerId: string }>) => {
            if (res?.ok && res.data) {
              sessionRef.current = res.data;
              saveSession(res.data);
              setMeId(res.data.playerId);
            } else {
              clearSession();
              sessionRef.current = null;
              setRoom(null);
              setMeId(null);
              showToast('info', 'Your room is no longer available.');
            }
          },
        );
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(S2C.state, onState);
    socket.on(S2C.chat, onChat);
    socket.on(S2C.notice, onNotice);
    socket.on(S2C.privateProfile, onPrivateProfile);

    connectSocket();
    setConnected(socket.connected);

    // Rejoin the room we were in before a refresh (initial connect).
    const existing = sessionRef.current;
    if (existing) {
      joiningRef.current = true;
      socket.emit(
        C2S.join,
        { code: existing.code, playerId: existing.playerId },
        (res: AckResponse<{ code: string; playerId: string }>) => {
          joiningRef.current = false;
          if (res?.ok && res.data) {
            sessionRef.current = res.data;
            setMeId(res.data.playerId);
          } else {
            clearSession();
            sessionRef.current = null;
            setMeId(null);
            if (res?.error && res.error !== 'Room not found. Check the invite code.') {
              showToast('info', res.error);
            }
          }
        },
      );
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(S2C.state, onState);
      socket.off(S2C.chat, onChat);
      socket.off(S2C.notice, onNotice);
      socket.off(S2C.privateProfile, onPrivateProfile);
    };
  }, [showToast]);

  useEffect(() => {
    if (room && sessionRef.current?.code !== room.code) {
      // server told us our code — remember it for refresh/reconnect
      if (sessionRef.current) {
        sessionRef.current = { ...sessionRef.current, code: room.code };
        saveSession(sessionRef.current);
      }
    }
    if (room && meId && room.code) {
      const stored = sessionRef.current;
      if (stored && stored.code === room.code && stored.playerId !== meId) return;
      if (!stored || stored.code !== room.code) {
        sessionRef.current = { code: room.code, playerId: meId };
        saveSession(sessionRef.current);
      }
    }
  }, [room, meId]);

  /* ------------------------------ transport ------------------------------ */

  const emit = useCallback(
    <T,>(event: string, payload?: unknown) =>
      new Promise<AckResponse<T>>((resolve) => {
        const timer = setTimeout(
          () => resolve({ ok: false, error: 'No response from the server. Check your connection.' }),
          9000,
        );
        socket.timeout(8000).emit(event, payload, (err: Error | null, res: AckResponse<T>) => {
          clearTimeout(timer);
          if (err) resolve({ ok: false, error: 'No response from the server. Check your connection.' });
          else resolve(res ?? { ok: false, error: 'Empty response from server.' });
        });
      }),
    [],
  );

  const run = useCallback(
    async (event: string, payload?: unknown) => {
      setBusy(true);
      try {
        const res = await emit(event, payload);
        if (!res.ok) {
          showToast('error', res.error ?? 'That action is not available right now.');
          return false;
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [emit, showToast],
  );

  const createRoom = useCallback(
    async (opts?: { roomName?: string; rules?: Partial<Rules> }) => {
      const p = profileRef.current;
      const name = p.name.trim() || 'Player 1';
      const res = await emit<{ code: string; playerId: string }>(C2S.create, {
        name,
        avatar: p.avatar,
        maxPlayers: p.maxPlayers,
        roomName: opts?.roomName,
        rules: opts?.rules,
      });
      if (!res.ok || !res.data) {
        showToast('error', res.error ?? 'Could not create a room.');
        return null;
      }
      sessionRef.current = res.data;
      saveSession(res.data);
      setMeId(res.data.playerId);
      setPrivateProfile(null);
      setChat([]);
      showToast('info', `Room ${res.data.code} created — invite your friends!`);
      return res.data.code;
    },
    [emit, showToast],
  );

  const joinRoom = useCallback(
    async (code: string, opts?: { playerId?: string }) => {
      const p = profileRef.current;
      joiningRef.current = true;
      const res = await emit<{ code: string; playerId: string }>(C2S.join, {
        code: code.trim().toUpperCase(),
        playerId: opts?.playerId,
        name: p.name.trim() || undefined,
        avatar: p.avatar,
      });
      joiningRef.current = false;
      if (!res.ok || !res.data) {
        showToast('error', res.error ?? 'Could not join that room.');
        return null;
      }
      sessionRef.current = res.data;
      saveSession(res.data);
      setMeId(res.data.playerId);
      setChat([]);
      return res.data.code;
    },
    [emit, showToast],
  );

  const leaveRoom = useCallback(async () => {
    await emit(C2S.leave, {});
    clearSession();
    sessionRef.current = null;
    setRoom(null);
    setMeId(null);
    setPrivateProfile(null);
    setChat([]);
  }, [emit]);

  const action = useCallback(
    (event: string, payload?: unknown) => run(event, { ...(payload ?? {}), code: undefined, playerId: undefined }),
    [run],
  );

  const start = useCallback(() => action(C2S.start), [action]);
  const roll = useCallback(() => action(C2S.roll), [action]);
  const buy = useCallback(() => action(C2S.buy), [action]);
  const pass = useCallback(() => action(C2S.pass), [action]);
  const endTurn = useCallback(() => action(C2S.endTurn), [action]);
  const payBail = useCallback(() => action('game:pay-bail'), [action]);
  const bid = useCallback((amount: number) => action(C2S.bid, { amount }), [action]);
  const build = useCallback((tile: number) => action(C2S.build, { tile }), [action]);
  const sellBuilding = useCallback((tile: number) => action(C2S.sellBuilding, { tile }), [action]);
  const mortgage = useCallback((tile: number) => action(C2S.mortgage, { tile }), [action]);
  const unmortgage = useCallback((tile: number) => action(C2S.unmortgage, { tile }), [action]);
  const setRules = useCallback((patch: Partial<Rules>) => action(C2S.rules, { rules: patch }), [action]);
  const kick = useCallback((targetId: string) => action(C2S.kick, { targetId }), [action]);

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit(C2S.chat, { text: trimmed.slice(0, 300) });
  }, []);

  const me = useMemo(() => {
    if (!room || !meId) return null;
    return room.players.find((p) => p.id === meId) ?? room.game?.players.find((p) => p.id === meId) ?? null;
  }, [room, meId]);

  const value: SessionApi = {
    room,
    meId,
    me,
    privateProfile,
    profile,
    chat,
    toast,
    connected,
    busy,
    saveProfileFields,
    createRoom,
    joinRoom,
    leaveRoom,
    start,
    roll,
    buy,
    pass,
    endTurn,
    payBail,
    bid,
    build,
    sellBuilding,
    mortgage,
    unmortgage,
    setRules,
    kick,
    sendChat,
    dismissToast,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export { DEFAULT_PROFILE };
