import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import EmbeddedPostgres from 'embedded-postgres';
import { config } from '../config.js';

const require = createRequire(import.meta.url);

const EMBEDDED_PORT = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
const dataDir = path.join(config.rootDir, '.pgdata');
const logFile = path.join(dataDir, 'server.log');

let embeddedRunning = false;

export function embeddedDataDir(): string {
  return dataDir;
}

export function embeddedPort(): number {
  return EMBEDDED_PORT;
}

/* --------------------------------- helpers --------------------------------- */

function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}) {
  return new Promise<{ code: number; out: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
    let out = '';
    let settled = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill();
          reject(new Error(`${path.basename(cmd)} timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : null;
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => (out += d.toString()));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    });
    // Resolve on 'exit', NOT 'close': pg_ctl detaches postgres.exe, which keeps
    // the inherited pipe handles open forever and would hang 'close' indefinitely.
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      setTimeout(() => resolve({ code: code ?? -1, out }), 120);
    });
  });
}

function isPortOpen(port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          const tail = fs.existsSync(logFile)
            ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-25).join('\n')
            : '(no server.log)';
          reject(new Error(`PostgreSQL did not answer on port ${port}.\n--- server.log ---\n${tail}`));
        } else {
          setTimeout(attempt, 400);
        }
      });
    };
    attempt();
  });
}

/** Runs one bootstrap step and reports exactly which one failed. */
async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[db] step "${name}" failed:`, err, `(${typeof err})`);
    throw err instanceof Error ? err : new Error(`${name} failed: ${String(err)}`);
  }
}

/**
 * The platform package only exports ./dist/index.js (no ./package.json), so we
 * resolve the entry point and walk up to the package root.
 */
function packageRoot(pkgName: string): string {
  const entry = require.resolve(pkgName);
  let dir = path.dirname(entry);
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'native'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(entry);
}

function binPath(name: string): string {
  return path.join(packageRoot('@embedded-postgres/windows-x64'), 'native', 'bin', name);
}

/** Where does the bundled cluster live and which binaries do we have? */
function windowsBins() {
  try {
    const pgCtl = binPath('pg_ctl.exe');
    const initdb = binPath('initdb.exe');
    if (fs.existsSync(pgCtl) && fs.existsSync(initdb)) return { pgCtl, initdb };
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * PostgreSQL refuses to boot while the calling process holds an
 * *administrative* token (which is the case in this dev environment).
 * `runas /trustlevel:0x20000` re-launches pg_ctl with a filtered token where
 * BUILTIN\Administrators is deny-only — that satisfies PostgreSQL's check.
 * On a normal (non-admin) machine the direct start succeeds first try.
 */
async function startWithPgCtl(pgCtl: string, dir: string, port: number): Promise<void> {
  if (await isPortOpen(port)) {
    console.log(`[db] PostgreSQL is already listening on port ${port}`);
    return;
  }

  const baseArgs = ['start', '-D', dir, '-o', `-p ${port}`, '-l', logFile, '-w', '-t', '45'];

  const direct = await run(pgCtl, baseArgs, { timeoutMs: 60_000 });
  if (direct.code === 0) return;

  if (process.platform !== 'win32') {
    throw new Error(`pg_ctl failed (exit ${direct.code}): ${direct.out}`);
  }

  console.log(
    `[db] direct pg_ctl start refused (exit ${direct.code}) — retrying with a filtered (non-admin) token`,
  );
  if (process.env.PG_VERBOSE === '1') console.log('[db] pg_ctl said:', direct.out.trim());

  // Retry under a non-administrator token via a helper script (avoids quoting hell).
  const script = path.join(dir, 'start-unelevated.cmd');
  const quoted = [pgCtl, ...baseArgs].map((a) => `"${a}"`).join(' ');
  fs.writeFileSync(script, `@echo off\n${quoted}\n`, 'utf8');

  const { code, out } = await run('runas', ['/trustlevel:0x20000', `cmd /c ${script}`], {
    timeoutMs: 20_000,
  });
  if (code !== 0 && !out.toLowerCase().includes('success')) {
    throw new Error(
      `Could not start PostgreSQL (direct start: ${direct.out.trim()}; runas: ${out.trim() || `exit ${code}`})`,
    );
  }
  console.log('[db] unelevated start accepted — waiting for the port…');
  await waitForPort(port, 45_000);
  console.log('[db] PostgreSQL is accepting connections');
}

async function stopWithPgCtl(pgCtl: string, dir: string): Promise<void> {
  try {
    const res = await run(pgCtl, ['stop', '-D', dir, '-m', 'fast', '-w', '-t', '30'], {
      timeoutMs: 45_000,
    });
    if (res.code === 0) return;
  } catch {
    /* fall through to the unelevated path */
  }
  try {
    const script = path.join(dir, 'stop-unelevated.cmd');
    fs.writeFileSync(
      script,
      `@echo off\n"${pgCtl}" stop -D "${dir}" -m fast -w -t 30\n`,
      'utf8',
    );
    await run('runas', ['/trustlevel:0x20000', `cmd /c ${script}`], { timeoutMs: 20_000 });
  } catch (err) {
    console.warn('[db] pg_ctl stop failed:', err instanceof Error ? err.message : err);
  }
}

async function ensureCluster(dir: string): Promise<void> {
  if (fs.existsSync(path.join(dir, 'PG_VERSION'))) return;

  const bins = windowsBins();
  if (!bins) {
    // Non-Windows / unexpected layout: let the library initialise the cluster.
    const client = makeLibraryClient();
    await client.initialise();
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  const pwFile = path.join(os.tmpdir(), `pg-pw-${Date.now().toString(36)}.txt`);
  fs.writeFileSync(pwFile, `${config.pg.password}\n`, 'utf8');
  try {
    const res = await run(
      bins.initdb,
      [
        `--pgdata=${dir}`,
        `--username=${config.pg.user}`,
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        '--lc-messages=C',
        `--pwfile=${pwFile}`,
      ],
      { timeoutMs: 180_000 },
    );
    if (res.code !== 0) throw new Error(`initdb failed: ${res.out}`);
    console.log('[db] initialised bundled PostgreSQL cluster');
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
}

function makeLibraryClient() {
  const Client = (EmbeddedPostgres as unknown as { default?: typeof EmbeddedPostgres }).default ?? EmbeddedPostgres;
  return new Client({
    databaseDir: dataDir,
    user: config.pg.user,
    password: config.pg.password,
    port: EMBEDDED_PORT,
    persistent: true,
    onLog: (m: string) => {
      if (process.env.PG_VERBOSE === '1') process.stdout.write(`[pg] ${m}`);
    },
    onError: () => undefined,
  });
}

/* --------------------------------- lifecycle -------------------------------- */

/**
 * Starts the bundled PostgreSQL:
 *   1. initdb the cluster in <repo>/.pgdata (once)
 *   2. pg_ctl start (retrying with a filtered token when running as admin)
 *   3. create the application database through the pg driver
 */
export async function startEmbedded(): Promise<{ port: number }> {
  await step('ensureCluster', () => ensureCluster(dataDir));
  console.log('[db] cluster directory ready');

  const bins = windowsBins();
  if (bins) {
    const alreadyUp = await isPortOpen(EMBEDDED_PORT);
    if (!alreadyUp && fs.existsSync(logFile)) fs.rmSync(logFile, { force: true });
    await step('startWithPgCtl', () => startWithPgCtl(bins.pgCtl, dataDir, EMBEDDED_PORT));
    embeddedRunning = true;
    await step('ensureDatabase', () => ensureDatabase(EMBEDDED_PORT));
    console.log('[db] database ensured');
    return { port: EMBEDDED_PORT };
  }

  // Library-managed start (macOS/Linux layouts).
  const client = makeLibraryClient();
  const alreadyInit = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (!alreadyInit) await client.initialise();
  try {
    await client.start();
  } catch (err) {
    // embedded-postgres rejects with no value on early process exit
    throw new Error(
      `embedded-postgres start() failed: ${err instanceof Error ? err.message : String(err ?? 'no detail')}` +
        (fs.existsSync(logFile)
          ? `\n--- server.log ---\n${fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-20).join('\n')}`
          : ''),
    );
  }
  embeddedRunning = true;
  libInstance = client;
  await ensureDatabase(EMBEDDED_PORT);
  return { port: EMBEDDED_PORT };
}

let libInstance: { stop(): Promise<void> } | null = null;

async function ensureDatabase(port: number): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    host: '127.0.0.1',
    port,
    user: config.pg.user,
    password: config.pg.password,
    database: 'postgres',
    connectionTimeoutMillis: 8000,
  });
  try {
    const res = await pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [config.pg.database]);
    if ((res.rowCount ?? 0) === 0) {
      // CREATE DATABASE cannot run inside a transaction/pool statement.
      // The cluster's default encoding may be WIN1252 (Windows locale), which makes
      // `ENCODING 'UTF8'` fail against template1 — template0 carries no encoding, so
      // it can always be cloned into UTF8. Ignore a concurrent duplicate (42P04).
      try {
        await pool.query(`CREATE DATABASE "${config.pg.database}" ENCODING 'UTF8' TEMPLATE template0`);
        console.log(`[db] created database "${config.pg.database}" (UTF8)`);
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code !== '42P04') throw err;
        console.log(`[db] database "${config.pg.database}" already exists`);
      }
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function stopEmbedded(): Promise<void> {
  if (!embeddedRunning) return;
  embeddedRunning = false;
  if (libInstance) {
    const client = libInstance;
    libInstance = null;
    try {
      await client.stop();
    } catch (err) {
      console.warn('[db] failed to stop embedded postgres cleanly:', err);
    }
    return;
  }
  const bins = windowsBins();
  if (bins) await stopWithPgCtl(bins.pgCtl, dataDir);
}
