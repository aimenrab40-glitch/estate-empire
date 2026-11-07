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
  type AuthUser,
  type ChatMessage,
  type PrivateProfile,
  type PublicPlayer,
  type RoomState,
} from '@shared/types';
import { connectSocket, socket } from '../lib/socket';
import { ensureGuest, fetchAuthConfig, fetchMe, logoutAuth } from '../lib/auth';
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
  privateProfile: PrivateProfile | null;
  profile: Profile;
  user: AuthUser | null;
  authLoading: boolean;
  oauth: { google: boolean; discord: boolean };
  chat: ChatMessage[];
  toast: Toast | null;
  connected: boolean;
  busy: boolean;
  saveProfileFields: (patch: Partial<Profile>) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  createRoom: (opts?: { roomName?: string }) => Promise<string | null>;
  joinRoom: (code: string) => Promise<string | null>;
  leaveRoom: () => Promise<void>;
  start: () => Promise<boolean>;
  nightAction: (targetId: string | null) => Promise<boolean>;
  vote: (targetId: string | null) => Promise<boolean>;
  endPhase: () => Promise<boolean>;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [oauth, setOauth] = useState({ google: false, discord: false });
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(loadSession());
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;
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

  const refreshUser = useCallback(async () => {
    const cfg = await fetchAuthConfig();
    setOauth({ google: cfg.google, discord: cfg.discord });
    const me = await fetchMe();
    if (me) {
      setUser(me);
      userRef.current = me;
      // Seed the public profile name/avatar from the OAuth account once.
      setProfile((prev) => {
        if (prev.name.trim()) return prev;
        const next = { ...prev, name: me.name.trim() || 'Player 1', image: me.discordImage ?? me.image };
        saveProfile(next);
        return next;
      });
    } else {
      setUser(null);
      userRef.current = null;
      // Local guest mode: a stable guest id lets us test rooms without OAuth.
      if (!cfg.requireAuth) {
        const guest = ensureGuest();
        setUser({ id: guest.userId, name: guest.userName || 'Guest', email: null, image: null, discordImage: null, provider: 'guest' });
      }
    }
    setAuthLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await logoutAuth();
    clearSession();
    sessionRef.current = null;
    setRoom(null);
    setMeId(null);
    setPrivateProfile(null);
    setUser(null);
    userRef.current = null;
    setAuthLoading(true);
    await refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  /* ---------------------------- socket wiring ---------------------------- */

  const initialConnectHandled = useRef(false);

  useEffect(() => {
    if (authLoading || !user) return;
    const onState = (next: RoomState) => {
      setRoom(next);
      if (sessionRef.current && sessionRef.current.code === next.code) {
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
    const onPrivateProfile = (next: PrivateProfile) => {
      const myId = sessionRef.current?.playerId;
      if (!next || !myId || next.playerId !== myId) return;
      setPrivateProfile(next);
    };
    const onConnect = () => {
      setConnected(true);
      if (!initialConnectHandled.current) {
        initialConnectHandled.current = true;
        return;
      }
      const s = sessionRef.current;
      if (s && !joiningRef.current) {
        socket.emit(
          C2S.join,
          { code: s.code, userId: userRef.current?.id },
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

    const existing = sessionRef.current;
    if (existing) {
      joiningRef.current = true;
      socket.emit(
        C2S.join,
        { code: existing.code, userId: userRef.current?.id },
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
  }, [authLoading, user?.id, showToast]);

  useEffect(() => {
    if (room && sessionRef.current?.code !== room.code) {
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
    async (opts?: { roomName?: string }) => {
      const u = userRef.current;
      if (!u) {
        showToast('error', 'Please sign in first.');
        return null;
      }
      const p = profileRef.current;
      const res = await emit<{ code: string; playerId: string }>(C2S.create, {
        userId: u.id,
        name: p.name.trim() || u.name || 'Player 1',
        avatar: p.avatar,
        image: p.image ?? u.discordImage ?? u.image,
        maxPlayers: p.maxPlayers,
        roomName: opts?.roomName,
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
    async (code: string) => {
      const u = userRef.current;
      if (!u) {
        showToast('error', 'Please sign in first.');
        return null;
      }
      const p = profileRef.current;
      joiningRef.current = true;
      const res = await emit<{ code: string; playerId: string }>(C2S.join, {
        code: code.trim().toUpperCase(),
        userId: u.id,
        name: p.name.trim() || u.name || undefined,
        avatar: p.avatar,
        image: p.image ?? u.discordImage ?? u.image,
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
  const nightAction = useCallback(
    (targetId: string | null) => action(C2S.nightAction, { targetId }),
    [action],
  );
  const vote = useCallback((targetId: string | null) => action(C2S.vote, { targetId }), [action]);
  const endPhase = useCallback(() => action(C2S.endPhase), [action]);
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
    user,
    authLoading,
    oauth,
    chat,
    toast,
    connected,
    busy,
    saveProfileFields,
    refreshUser,
    logout,
    createRoom,
    joinRoom,
    leaveRoom,
    start,
    nightAction,
    vote,
    endPhase,
    kick,
    sendChat,
    dismissToast,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export { DEFAULT_PROFILE };
