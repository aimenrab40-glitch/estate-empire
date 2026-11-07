export interface RoomSession {
  code: string;
  playerId: string;
}

export interface Profile {
  name: string;
  avatar: string;
  image: string | null;
  maxPlayers: number;
}

const SESSION_KEY = 'estate.session.v1';
const PROFILE_KEY = 'estate.profile.v1';
const AUTH_KEY = 'supernova.auth.v1';

export interface LinkedAuth {
  provider: 'google' | 'discord';
  name: string | null;
  image: string | null;
}

export function loadAuth(): LinkedAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LinkedAuth;
  } catch {
    return null;
  }
}

export function saveAuth(auth: LinkedAuth | null) {
  if (!auth) localStorage.removeItem(AUTH_KEY);
  else localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function loadSession(): RoomSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoomSession;
    if (!parsed?.code || !parsed?.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: RoomSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export const DEFAULT_PROFILE: Profile = { name: '', avatar: 'tophat', image: null, maxPlayers: 4 };

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
