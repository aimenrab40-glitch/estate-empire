import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from this file to the npm-workspaces root (the directory whose
 * package.json declares `workspaces`). This is layout-agnostic:
 *   dev build   HHHH/server/src/config.ts      -> HHHH
 *   prod build  HHHH/server/dist/server/src/config.js -> HHHH
 */
function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const manifest = path.join(dir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
      if (Array.isArray(pkg.workspaces)) return dir;
    } catch {
      /* keep walking up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: <root>/server/src or <root>/server/dist/server/src
  return path.resolve(start, '../..');
}

const rootDir = findWorkspaceRoot(__dirname);

/** Locate the built client, robust to both tsx-dev (__dirname = .../server/src)
 *  and tsc-prod (__dirname = .../server/dist/server/src) output layouts. */
function locateClientDist(): string {
  const here = path.resolve(__dirname);
  const candidates = [
    path.resolve(here, '../../client/dist'),      // tsx dev: .../server/src -> .../client/dist
    path.resolve(here, '../../../client/dist'),   // tsc flat:   .../server/dist -> .../client/dist
    path.resolve(here, '../../../../client/dist'),// tsc nested: .../server/dist/server/src -> .../client/dist
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return path.resolve(here, '../../client/dist');
}

/** Parse a Neon-style `postgres://user:pass@host:port/db?sslmode=require` into pg options. */
function parseDatabaseUrl(url: string): Record<string, unknown> {
  const m = url.match(
    /^(?:postgres(?:ql)?:\/\/)?(?:([^:]+)(?::([^@]*))?@)?([^:/]+)(?::(\d+))?\/([^?]+)?(\??.*)?$/,
  );
  if (!m) return {};
  const [, user, password, host, port, database, search] = m;
  const out: Record<string, unknown> = {};
  if (user) out.user = user;
  if (password !== undefined) out.password = password;
  if (host) out.host = host;
  if (port) out.port = Number(port);
  if (database) out.database = database.replace(/\/$/, '');
  if (search) {
    for (const pair of search.slice(1).split('&')) {
      const [k, v] = pair.split('=');
      if (k === 'sslmode') out.ssl = v === 'require' || v === 'verify-full' ? { rejectUnauthorized: false } : false;
    }
  }
  return out;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientDist: locateClientDist(),
  /** Repository root (HHHH/) — used for the embedded Postgres data dir. */
  rootDir,
  pg: (() => {
    const base: Record<string, unknown> = {
      host: process.env.PGHOST ?? process.env.PG_HOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? process.env.PG_PORT ?? 5432),
      user: process.env.PGUSER ?? process.env.PG_USER ?? 'postgres',
      password: process.env.PGPASSWORD ?? process.env.PG_PASSWORD ?? 'postgres',
      database: process.env.PGDATABASE ?? process.env.PG_DATABASE ?? 'estate',
    };
    if (process.env.DATABASE_URL) {
      // Neon (and most managed Postgres) provide a single DATABASE_URL.
      return { ...base, ...parseDatabaseUrl(process.env.DATABASE_URL) } as {
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
        ssl?: boolean | { rejectUnauthorized: boolean };
      };
    }
    return base as {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    };
  })(),
  /** When true the server refuses to start without a reachable PostgreSQL. */
  requireDb:
    process.env.REQUIRE_DB === '1' ||
    !!process.env.DATABASE_URL ||
    !!process.env.PGHOST ||
    !!process.env.PG_HOST,
  /** In production (Render sets RENDER=true / NODE_ENV=production) a database is mandatory. */
  isProd: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true',
  /** Set NO_DB=1 to run without persistence (local dev only). */
  noDb: process.env.NO_DB === '1',
  /** Set EMBEDDED_PG=0 to never boot the bundled PostgreSQL. */
  allowEmbedded: process.env.EMBEDDED_PG !== '0',
  /** Fixed dice RNG for deterministic engine tests (dev only). */
  fixedDice: process.env.DICE_MODE === 'fixed',
};
