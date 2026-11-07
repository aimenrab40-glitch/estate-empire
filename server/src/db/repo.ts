import { db } from './pool.js';
import type { ApiRoomSummary, ChatMessage, GameState, LinkedAccount, MatchHistoryRow } from '../../../shared/src/types.js';

const warned = new Set<string>();
function softFail(where: string, err: unknown) {
  if (warned.has(where)) return;
  warned.add(where);
  console.warn(`[db] ${where} failed:`, (err as Error)?.message ?? err);
}

export async function persistRoom(
  code: string,
  name: string,
  maxPlayers: number,
  hostId: string,
  status: 'lobby' | 'playing' | 'finished',
) {
  try {
    await db.query(
      `INSERT INTO rooms (code, name, max_players, host_id, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,
         max_players = EXCLUDED.max_players, host_id = EXCLUDED.host_id,
         status = EXCLUDED.status, updated_at = now()`,
      [code, name, maxPlayers, hostId, status],
    );
  } catch (err) {
    softFail('persistRoom', err);
  }
}

export async function persistPlayer(
  code: string,
  player: { id: string; name: string; avatar: string; image?: string | null; color: string; seat: number },
) {
  try {
    await db.query(
      `INSERT INTO players (id, room_code, name, avatar, image_url, color, seat)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar,
         image_url = EXCLUDED.image_url, color = EXCLUDED.color, seat = EXCLUDED.seat`,
      [player.id, code, player.name, player.avatar, (player.image ?? null) as string | null, player.color, player.seat],
    );
  } catch (err) {
    softFail('persistPlayer', err);
  }
}

export async function removePlayer(playerId: string) {
  try {
    await db.query(`DELETE FROM players WHERE id = $1`, [playerId]);
  } catch (err) {
    softFail('removePlayer', err);
  }
}

export async function persistGameState(state: GameState) {
  try {
    await db.query(
      `INSERT INTO game_snapshots (room_code, state, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (room_code) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
      [state.code, JSON.stringify(state)],
    );
  } catch (err) {
    softFail('persistGameState', err);
  }
}

export async function persistGameContext(code: string, state: GameState, roles: Record<string, string> = {}) {
  try {
    await db.query(
      `INSERT INTO game_snapshots (room_code, state, private_roles, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (room_code) DO UPDATE SET state = EXCLUDED.state,
         private_roles = EXCLUDED.private_roles, updated_at = now()`,
      [code, JSON.stringify(state), JSON.stringify(roles)],
    );
  } catch (err) {
    softFail('persistGameContext', err);
  }
}

export interface PersistedGameContext {
  state: GameState;
  roles: Record<string, string>;
}

export async function getGameContext(code: string): Promise<PersistedGameContext | null> {
  try {
    const res = await db.query<{ state: GameState; private_roles: unknown }>(
      `SELECT state, private_roles FROM game_snapshots WHERE room_code = $1`,
      [code],
    );
    if (res.rowCount === 0) return null;
    const r = res.rows[0];
    return {
      state: r.state,
      roles: (r.private_roles ?? {}) as Record<string, string>,
    };
  } catch (err) {
    softFail('getGameContext', err);
    return null;
  }
}

export async function persistEvent(code: string, type: string, payload: unknown) {
  try {
    await db.query(`INSERT INTO game_events (room_code, type, payload) VALUES ($1, $2, $3)`, [
      code,
      type,
      JSON.stringify(payload ?? null),
    ]);
  } catch (err) {
    softFail('persistEvent', err);
  }
}

export async function finishMatch(
  code: string,
  name: string,
  winner: string | null,
  playerCount: number,
  rounds: number,
  startedAt: number | null,
) {
  try {
    await db.query(
      `INSERT INTO match_history (room_code, room_name, winner, player_count, rounds, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [code, name, winner, playerCount, rounds, startedAt ? new Date(startedAt) : null],
    );
    await db.query(`UPDATE rooms SET status = 'finished', updated_at = now() WHERE code = $1`, [code]);
  } catch (err) {
    softFail('finishMatch', err);
  }
}

export async function getRoomSummary(code: string): Promise<ApiRoomSummary | null> {
  try {
    const room = await db.query<{ code: string; name: string; status: string; max_players: number; created_at: Date; host_id: string }>(
      `SELECT code, name, status, max_players, host_id, created_at FROM rooms WHERE code = $1`,
      [code],
    );
    if (room.rowCount === 0) return null;
    const players = await db.query<{ name: string; avatar: string; color: string }>(
      `SELECT name, avatar, color FROM players WHERE room_code = $1 ORDER BY seat`,
      [code],
    );
    const r = room.rows[0];
    return {
      code: r.code,
      name: r.name,
      status: r.status,
      maxPlayers: r.max_players,
      playerCount: players.rowCount ?? 0,
      players: players.rows,
      createdAt: r.created_at.toISOString(),
    };
  } catch (err) {
    softFail('getRoomSummary', err);
    return null;
  }
}

export interface StoredRoom {
  code: string;
  name: string;
  maxPlayers: number;
  hostId: string;
  status: string;
  createdAt: Date;
}

export async function getStoredRoom(code: string): Promise<StoredRoom | null> {
  try {
    const res = await db.query<{
      code: string;
      name: string;
      max_players: number;
      host_id: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT code, name, max_players, host_id, status, created_at FROM rooms WHERE code = $1`,
      [code],
    );
    if (res.rowCount === 0) return null;
    const r = res.rows[0];
    return {
      code: r.code,
      name: r.name,
      maxPlayers: r.max_players,
      hostId: r.host_id,
      status: r.status,
      createdAt: r.created_at,
    };
  } catch (err) {
    softFail('getStoredRoom', err);
    return null;
  }
}

export interface StoredPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
  seat: number;
}

export async function getStoredPlayers(code: string): Promise<StoredPlayer[]> {
  try {
    const res = await db.query<StoredPlayer>(
      `SELECT id, name, avatar, color, seat FROM players WHERE room_code = $1 ORDER BY seat`,
      [code],
    );
    return res.rows;
  } catch (err) {
    softFail('getStoredPlayers', err);
    return [];
  }
}

export async function getSnapshot(code: string): Promise<GameState | null> {
  try {
    const res = await db.query<{ state: GameState }>(
      `SELECT state FROM game_snapshots WHERE room_code = $1`,
      [code],
    );
    return res.rows[0]?.state ?? null;
  } catch (err) {
    softFail('getSnapshot', err);
    return null;
  }
}

export async function listHistory(limit = 15): Promise<MatchHistoryRow[]> {
  try {
    const res = await db.query<MatchHistoryRow>(
      `SELECT id, room_code AS code, room_name AS name, winner, player_count AS players,
              rounds, started_at, finished_at
         FROM match_history ORDER BY finished_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows;
  } catch (err) {
    softFail('listHistory', err);
    return [];
  }
}

export async function listChat(code: string, limit = 50): Promise<ChatMessage[]> {
  try {
    const res = await db.query<{ payload: ChatMessage }>(
      `SELECT payload FROM game_events WHERE room_code = $1 AND type = 'chat'
       ORDER BY id DESC LIMIT $2`,
      [code, limit],
    );
    return res.rows.map((r) => r.payload).reverse();
  } catch (err) {
    softFail('listChat', err);
    return [];
  }
}

export async function listEvents(code: string, limit = 50) {
  try {
    const res = await db.query(
      `SELECT id, type, payload, created_at FROM game_events WHERE room_code = $1
       ORDER BY id DESC LIMIT $2`,
      [code, limit],
    );
    return res.rows;
  } catch (err) {
    softFail('listEvents', err);
    return [];
  }
}

/* --------------------------- linked accounts (OAuth) -------------------------- */

export async function upsertLinkedAccount(account: LinkedAccount): Promise<LinkedAccount> {
  try {
    const id = `${account.provider}:${account.providerSub}`;
    if (account.provider === 'google') {
      await db.query(
        `INSERT INTO users (id, google_sub, email, name, image_url, player_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
           image_url = EXCLUDED.image_url, player_id = EXCLUDED.player_id, updated_at = now()`,
        [id, account.providerSub, account.email, account.displayName ?? 'Player', account.avatarUrl, account.playerId || null],
      );
    } else {
      await db.query(
        `INSERT INTO users (id, discord_id, email, name, discord_image_url, image_url, player_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (discord_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
           discord_image_url = EXCLUDED.discord_image_url, image_url = EXCLUDED.image_url,
           player_id = EXCLUDED.player_id, updated_at = now()`,
        [id, account.providerSub, account.email, account.displayName ?? 'Player', account.avatarUrl, account.avatarUrl, account.playerId || null],
      );
    }
  } catch (err) {
    softFail('upsertLinkedAccount', err);
  }
  return account;
}

export async function getLinkedAccount(provider: string, sub: string): Promise<LinkedAccount | null> {
  try {
    const col = provider === 'google' ? 'google_sub' : 'discord_id';
    const res = await db.query<{
      provider: string;
      provider_sub: string;
      email: string | null;
      display_name: string | null;
      avatar_url: string | null;
      player_id: string | null;
    }>(
      `SELECT NULLIF($1 = 'google', google_sub, discord_id) AS provider_sub, email,
              name AS display_name,
              COALESCE(discord_image_url, image_url) AS avatar_url, player_id,
              $1 AS provider
         FROM users WHERE ${col} = $2 LIMIT 1`,
      [provider, sub],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      playerId: r.player_id ?? '',
      provider: r.provider as 'google' | 'discord',
      providerSub: r.provider_sub,
      email: r.email,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
    };
  } catch (err) {
    softFail('getLinkedAccount', err);
    return null;
  }
}

export async function getLinkedProfile(playerId: string): Promise<LinkedAccount | null> {
  try {
    const res = await db.query<{
      provider: string;
      provider_sub: string;
      email: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }>(
      `SELECT 'google' AS provider, google_sub AS provider_sub, email, name AS display_name, image_url AS avatar_url
         FROM users WHERE player_id = $1 AND google_sub IS NOT NULL
         UNION ALL
         SELECT 'discord' AS provider, discord_id AS provider_sub, email, name AS display_name, COALESCE(discord_image_url, image_url) AS avatar_url
         FROM users WHERE player_id = $1 AND discord_id IS NOT NULL
         LIMIT 1`,
      [playerId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      playerId,
      provider: r.provider as 'google' | 'discord',
      providerSub: r.provider_sub,
      email: r.email,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
    };
  } catch (err) {
    softFail('getLinkedProfile', err);
    return null;
  }
}

/** Persist an OAuth session token (opaque, hashed at rest). */
export async function createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
  try {
    await db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
      [tokenHash, userId, expiresAt],
    );
  } catch (err) {
    softFail('createSession', err);
  }
}
