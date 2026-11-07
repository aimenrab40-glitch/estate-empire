import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { initDb, shutdownDb, db } from './db/pool.js';
import { getRoomSummary, getSnapshot, listEvents, listHistory } from './db/repo.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { getRoom, listRooms, restoreActiveRooms, sweepIdleRooms, toRoomState } from './rooms/roomManager.js';

const app = express();
// Render puts a reverse proxy in front — trust it so secure cookies / IPs work.
app.set('trust proxy', true);
// Don't advertise the framework; send basic hardening headers on every response.
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const startedAt = Date.now();

/* ---------------------------------- REST ---------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: db.mode,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    rooms: listRooms().length,
    version: '1.1.0',
  });
});

app.get('/api/rooms', (_req, res) => {
  res.json(
    listRooms().map((r) => ({
      code: r.code,
      name: r.name,
      status: r.status,
      maxPlayers: r.maxPlayers,
      playerCount: r.game.state.players.length,
      players: r.game.state.players.map((p) => ({
        name: p.name,
        avatar: p.avatar,
        color: p.color,
      })),
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  );
});

app.get('/api/rooms/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const live = getRoom(code);
  if (live) {
    const s = toRoomState(live);
    return res.json({
      code: s.code,
      name: s.name,
      status: s.status,
      maxPlayers: s.maxPlayers,
      playerCount: s.players.length,
      players: s.players.map((p) => ({ name: p.name, avatar: p.avatar, color: p.color })),
      createdAt: new Date(s.createdAt).toISOString(),
      live: true,
    });
  }
  const summary = await getRoomSummary(code);
  if (!summary) return res.status(404).json({ error: 'Room not found' });
  res.json({ ...summary, live: false });
});

app.get('/api/rooms/:code/events', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const live = getRoom(code);
  if (live) {
    return res.json(live.game.state.log.slice(-50).reverse());
  }
  res.json(await listEvents(code, 50));
});

app.get('/api/rooms/:code/state', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const live = getRoom(code);
  if (live) return res.json(toRoomState(live));
  const snap = await getSnapshot(code);
  if (!snap) return res.status(404).json({ error: 'No saved state for this room' });
  res.json(snap);
});

app.get('/api/history', async (_req, res) => {
  res.json(await listHistory(20));
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

/* --------------------------- static client (prod) -------------------------- */

const distIndex = path.join(config.clientDist, 'index.html');
if (fs.existsSync(distIndex)) {
  app.use(express.static(config.clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(distIndex);
  });
  console.log(`[http] serving built client from ${config.clientDist}`);
}

/* --------------------------------- sockets -------------------------------- */

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

registerSocketHandlers(io);

export { io, app, server };

/* --------------------------------- startup -------------------------------- */

async function main() {
  await initDb();

  // Production is never allowed to silently degrade to in-memory storage.
  if ((config.isProd || config.requireDb) && db.mode === 'memory') {
    throw new Error(
      'Production requires a reachable PostgreSQL (set DATABASE_URL). In-memory storage is disabled.',
    );
  }

  // Automatic recovery: rebuild every unfinished room from PostgreSQL.
  const restored = await restoreActiveRooms();
  if (restored > 0) {
    console.log(`[db] restored ${restored} active room(s) from PostgreSQL`);
  }

  server.listen(config.port, '0.0.0.0', () => {
    console.log('');
    console.log('  🎲 Estate Empire server is up');
    console.log(`     listening on 0.0.0.0:${config.port}`);
    console.log(`     public URL      : ${process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:' + config.port}`);
    console.log(`     Health check     : /api/health`);
    console.log(`     Database mode     : ${db.mode}`);
    console.log('');
  });
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} received — shutting down…`);
  clearInterval(sweepHandle);
  io.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await shutdownDb();
  process.exit(0);
}

const sweepHandle = setInterval(() => {
  const removed = sweepIdleRooms();
  if (removed) console.log(`[rooms] swept ${removed} idle room(s)`);
}, 60_000);
sweepHandle.unref();

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
