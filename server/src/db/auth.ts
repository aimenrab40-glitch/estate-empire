import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { db } from './pool.js';
import { config } from '../config.js';

const COOKIE = 'supernova_session';
const STATE_COOKIE = 'supernova_oauth_state';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  discordImage: string | null;
  provider: 'google' | 'discord' | 'guest';
}

export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const discordConfigured = () =>
  Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

/** Local-dev escape hatch: allow play without OAuth (never in production). */
export const compatMode = () => process.env.NO_AUTH === '1' && !config.isProd;

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getSessionUser(req: Request): AuthUser | null {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  // Synchronous lookup against an in-memory cache is overkill — fetch is async,
  // so this sync helper is used only by the async middleware below.
  return null;
}

export function getTokenFromReq(req: Request): string | null {
  return parseCookies(req)[COOKIE] ?? null;
}

export async function findUserByToken(token: string | null | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  try {
    const res = await db.query<{
      id: string;
      name: string;
      email: string | null;
      image_url: string | null;
      discord_image_url: string | null;
      google_sub: string | null;
    }>(
      `SELECT u.id, u.name, u.email, u.image_url, u.discord_image_url, u.google_sub
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hash(token)],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image_url,
      discordImage: row.discord_image_url,
      provider: row.google_sub ? 'google' : 'discord',
    };
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES ($1, $2, $3, now())`,
    [hash(token), userId, expires],
  );
  return token;
}

export async function deleteSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  try {
    await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)]);
  } catch {
    /* ignore */
  }
}

function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}; ${
      config.isProd ? 'Secure; ' : ''
    }`,
  );
}

function clearCookies(res: Response) {
  res.setHeader(
    'Set-Cookie',
    [
      `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    ],
  );
}

async function upsertUser(data: {
  googleSub?: string | null;
  discordId?: string | null;
  email?: string | null;
  name?: string;
  image?: string | null;
  discordImage?: string | null;
}): Promise<AuthUser> {
  const id = crypto.randomUUID();
  const name = (data.name || 'Player').slice(0, 48);
  const res = await db.query<{ id: string }>(
    `INSERT INTO users (id, google_sub, discord_id, email, name, image_url, discord_image_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (google_sub) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
       image_url = COALESCE(EXCLUDED.image_url, users.image_url), updated_at = now()
     RETURNING id`,
    [
      id,
      data.googleSub ?? null,
      data.discordId ?? null,
      data.email ?? null,
      name,
      data.image ?? null,
      data.discordImage ?? null,
    ],
  );
  const userId = (res.rows[0]?.id ?? id) as string;
  const full = await db.query<{
    id: string;
    name: string;
    email: string | null;
    image_url: string | null;
    discord_image_url: string | null;
    google_sub: string | null;
  }>(
    `SELECT id, name, email, image_url, discord_image_url, google_sub FROM users WHERE id = $1`,
    [userId],
  );
  const row = full.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image_url,
    discordImage: row.discord_image_url,
    provider: row.google_sub ? 'google' : 'discord',
  };
}

function frontendOrigin(req: Request): string {
  const host = req.get('host') ?? 'localhost:4000';
  const proto = config.isProd ? 'https' : 'http';
  return `${proto}://${host}`;
}

function redirectUri(req: Request, provider: 'google' | 'discord'): string {
  return `${frontendOrigin(req)}/auth/${provider}/callback`;
}

export function registerAuth(app: Express) {
  app.get('/auth/config', (_req, res) => {
    res.json({
      google: googleConfigured(),
      discord: discordConfigured(),
      // Sign-in is only mandatory once OAuth keys exist. Until then guests play.
      requireAuth: Boolean((googleConfigured() || discordConfigured()) && !compatMode()),
    });
  });

  app.get('/auth/me', async (req, res) => {
    const token = parseCookies(req)[COOKIE];
    const user = await findUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.json({ user });
  });

  app.post('/auth/logout', async (req, res) => {
    const token = parseCookies(req)[COOKIE];
    await deleteSession(token);
    clearCookies(res);
    res.json({ ok: true });
  });

  /* ------------------------------ Google ------------------------------ */

  app.get('/auth/google', (req, res) => {
    if (!googleConfigured()) {
      res.status(503).json({ error: 'Google OAuth is not configured yet.' });
      return;
    }
    const state = randomToken();
    res.setHeader(
      'Set-Cookie',
      `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; ${config.isProd ? 'Secure; ' : ''}`,
    );
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(req, 'google'),
      response_type: 'code',
      scope: 'openid profile email',
      prompt: 'select_account',
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`);
  });

  app.get('/auth/google/callback', async (req, res) => {
    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      const cookieState = parseCookies(req)[STATE_COOKIE];
      if (!code || !state || state !== cookieState) throw new Error('Invalid OAuth state.');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri(req, 'google'),
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) throw new Error('Google token exchange failed.');
      const tokens = (await tokenRes.json()) as { access_token?: string };
      if (!tokens.access_token) throw new Error('Google returned no access token.');
      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!infoRes.ok) throw new Error('Google userinfo failed.');
      const info = (await infoRes.json()) as {
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      };
      if (!info.sub) throw new Error('Google returned no subject.');
      const user = await upsertUser({
        googleSub: info.sub,
        email: info.email ?? null,
        name: info.name ?? 'Player',
        image: info.picture ?? null,
      });
      const sessionToken = await createSession(user.id);
      clearCookies(res);
      setSessionCookie(res, sessionToken);
      res.redirect('/');
    } catch (err) {
      console.error('[auth] google callback failed:', err);
      res.redirect('/?error=google');
    }
  });

  /* ------------------------------ Discord ------------------------------ */

  app.get('/auth/discord', (req, res) => {
    if (!discordConfigured()) {
      res.status(503).json({ error: 'Discord OAuth is not configured yet.' });
      return;
    }
    const state = randomToken();
    res.setHeader(
      'Set-Cookie',
      `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; ${config.isProd ? 'Secure; ' : ''}`,
    );
    const q = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      redirect_uri: redirectUri(req, 'discord'),
      response_type: 'code',
      scope: 'identify',
      prompt: 'consent',
      state,
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${q.toString()}`);
  });

  app.get('/auth/discord/callback', async (req, res) => {
    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      const cookieState = parseCookies(req)[STATE_COOKIE];
      if (!code || !state || state !== cookieState) throw new Error('Invalid OAuth state.');
      const creds = Buffer.from(
        `${process.env.DISCORD_CLIENT_ID}:${process.env.DISCORD_CLIENT_SECRET}`,
      ).toString('base64');
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${creds}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri(req, 'discord'),
        }),
      });
      if (!tokenRes.ok) throw new Error('Discord token exchange failed.');
      const tokens = (await tokenRes.json()) as { access_token?: string };
      if (!tokens.access_token) throw new Error('Discord returned no access token.');
      const meRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!meRes.ok) throw new Error('Discord user fetch failed.');
      const me = (await meRes.json()) as {
        id?: string;
        username?: string;
        global_name?: string | null;
        avatar?: string | null;
      };
      if (!me.id) throw new Error('Discord returned no id.');
      const avatar = me.avatar
        ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.gif?size=128`
        : null;
      const user = await upsertUser({
        discordId: me.id,
        name: me.global_name ?? me.username ?? 'Player',
        discordImage: avatar,
      });
      const sessionToken = await createSession(user.id);
      clearCookies(res);
      setSessionCookie(res, sessionToken);
      res.redirect('/');
    } catch (err) {
      console.error('[auth] discord callback failed:', err);
      res.redirect('/?error=discord');
    }
  });

  app.get('/auth/session-token', async (req, res) => {
    // Cookie fallback for browsers where a redirect to / is needed — the app
    // sets its own document.cookie; this endpoint validates one.
    const token = parseCookies(req)[COOKIE];
    const user = await findUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.json({ user });
  });
}

export { parseCookies };
