import { Pool } from 'pg';
import type { PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config.js';
import { schemaSql } from './schema.js';
import { startEmbedded } from './embedded.js';

export type DbMode = 'external' | 'embedded' | 'memory';

let pool: Pool | null = null;
let mode: DbMode = 'memory';

export const db = {
  get mode(): DbMode {
    return mode;
  },
  get available(): boolean {
    return mode !== 'memory';
  },
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!pool) return Promise.reject(new Error('PostgreSQL is not available (in-memory mode)'));
    return pool.query<T>(text, params as never[]);
  },
};

function use(config2: PoolConfig) {
  pool?.end().catch(() => undefined);
  pool = new Pool({ ...config2, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 });
}

async function migrate() {
  await db.query(schemaSql());
}

async function probe(timeoutMs: number, pgConfig?: PoolConfig): Promise<void> {
  const c = new Pool({ ...(pgConfig ?? config.pg), connectionTimeoutMillis: timeoutMs, idleTimeoutMillis: 1000 });
  try {
    await c.query('SELECT 1');
  } finally {
    await c.end().catch(() => undefined);
  }
}

/**
 * Connection strategy:
 *  1. NO_DB=1                       → in-memory only (explicit opt-out)
 *  2. reachable PostgreSQL          → use PGHOST/PGPORT/... (or DATABASE_URL)
 *  3. nothing reachable             → boot the bundled PostgreSQL (embedded)
 *  4. embedded failed               → in-memory, loudly announced
 */
export async function initDb(): Promise<DbMode> {
  if (config.noDb) {
    mode = 'memory';
    console.warn('[db] NO_DB=1 — running with in-memory storage only.');
    return mode;
  }

  use(config.pg);
  try {
    await probe(4000);
    await migrate();
    mode = 'external';
    console.log(
      `[db] connected to external PostgreSQL at ${config.pg.host}:${config.pg.port}/${config.pg.database}`,
    );
    return mode;
  } catch (err) {
    if (process.env.PG_VERBOSE === '1') {
      const detail = err instanceof Error ? err.message : String(err ?? 'unknown error');
      console.warn('[db] external probe failed:', detail);
    }
  }

  if (config.allowEmbedded) {
    try {
      console.log('[db] no external PostgreSQL found — starting the bundled PostgreSQL…');
      const { port } = await startEmbedded();
      const embeddedConfig = { ...config.pg, port };
      use(embeddedConfig);
      await probe(8000, embeddedConfig);
      await migrate();
      mode = 'embedded';
      console.log(`[db] embedded PostgreSQL ready on port ${port} (database: ${config.pg.database})`);
      return mode;
    } catch (err) {
      console.error('[db] embedded PostgreSQL failed to start:', err);
    }
  }

  mode = 'memory';
  console.warn(
    '[db] ⚠ PostgreSQL is UNAVAILABLE — falling back to in-memory storage. Rooms and matches will not survive a restart.',
  );
  return mode;
}

export async function shutdownDb(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => undefined);
    pool = null;
  }
  if (mode === 'embedded') {
    const { stopEmbedded } = await import('./embedded.js');
    await stopEmbedded();
  }
}
