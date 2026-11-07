import type { ApiRoomSummary, MatchHistoryRow } from '@shared/types';

async function get<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  health: () => get<{ ok: boolean; db: string; rooms: number; uptimeSec: number }>('/api/health'),
  rooms: () => get<ApiRoomSummary[]>('/api/rooms'),
  history: () => get<MatchHistoryRow[]>('/api/history'),
  room: (code: string) => get<ApiRoomSummary & { live: boolean }>(`/api/rooms/${code}`),
};
