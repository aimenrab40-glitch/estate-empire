import type { AuthUser } from '@shared/types';

let guestCounter = 0;

export function ensureGuest(): { userId: string; userName: string } {
  try {
    const raw = localStorage.getItem('supernova.guest.v1');
    if (raw) {
      const parsed = JSON.parse(raw) as { userId?: string; userName?: string };
      if (parsed.userId) return { userId: parsed.userId, userName: parsed.userName ?? '' };
    }
  } catch {
    /* ignore */
  }
  guestCounter += 1;
  const id = `guest-${Date.now().toString(36)}-${guestCounter}`;
  const entry = { userId: id, userName: '' };
  try {
    localStorage.setItem('supernova.guest.v1', JSON.stringify(entry));
  } catch {
    /* ignore */
  }
  return entry;
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: AuthUser };
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function fetchAuthConfig(): Promise<{ google: boolean; discord: boolean; requireAuth: boolean }> {
  try {
    const res = await fetch('/auth/config');
    // Guests always play — a failed config fetch must never lock anyone out.
    if (!res.ok) return { google: false, discord: false, requireAuth: false };
    return (await res.json()) as { google: boolean; discord: boolean; requireAuth: boolean };
  } catch {
    return { google: false, discord: false, requireAuth: false };
  }
}

export async function logoutAuth(): Promise<void> {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
}
