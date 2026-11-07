---
title: SUPER NOVA Mafia
emoji: 🧟
colorFrom: red
colorTo: black
sdk: docker
app_file: Dockerfile
app_port: 7860
---

# 🥀 SUPER NOVA — Mafia

A real-time multiplayer **Mafia** social-deduction game for the browser —
secret roles, night kills/saves/investigations, day discussion and voting,
a 3D table with seated characters, plus optional Google/Discord sign-in.
Built with **React + TypeScript**, **Node.js + Express**, **Socket.IO**,
**PostgreSQL** and **Tailwind CSS**.

---

## 1. Requirements

| Requirement | Notes |
| --- | --- |
| Node.js ≥ 20 | Developed on Node 26 (`portable copy lives in .tools/` if you use the bundled launcher) |
| npm ≥ 10 | Ships with Node |
| PostgreSQL *(optional)* | If none is reachable the server boots the **bundled PostgreSQL** from `node_modules/@embedded-postgres/*`, and only as a last resort falls back to in-memory storage (clearly announced in the console) |

## 2. Launch

```bash
npm install          # once — installs every workspace (shared, server, client)
npm run dev          # starts API + Socket.IO (:4000) and Vite dev server (:5173)
```

Open **http://localhost:5173** in two different browsers (or a normal + incognito window)
to play with two players.

Other scripts:

```bash
npm run dev:server   # game server only
npm run dev:client   # React client only
npm run typecheck    # tsc for both server and client
npm run build        # production build (client/dist + server/dist)
npm run start        # run the built server (serves client/dist on :4000)
```

Engine tests (no browser needed):

```bash
npx tsx server/scripts/test-rules.ts     # 21 rule assertions
npx tsx server/scripts/simulate.ts 4 3000  # thousands of headless turns
```

## 3. Database configuration

The server picks the first strategy that works:

1. `NO_DB=1` → in-memory only (explicit opt-out)
2. reachable PostgreSQL → uses `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`
   (defaults: `localhost:5432`, `postgres`/`postgres`, database `estate`)
3. nothing reachable → boots the bundled PostgreSQL on port `EMBEDDED_PG_PORT` (default **5433**)
   with its data directory in `./.pgdata`
4. embedded failed → in-memory fallback, loudly announced

> Windows note: PostgreSQL refuses to run under an *elevated administrator* token. When that
> happens the server re-launches `pg_ctl` through `runas /trustlevel:0x20000`, which drops the
> Administrators group to deny-only. On a normal user account the direct start is used.

Persisted tables: `rooms`, `players`, `game_snapshots`, `game_events`, `match_history`.

REST endpoints:

```
GET /api/health               server + database status
GET /api/rooms                open tables (live)
GET /api/rooms/:code          room summary (live, else from PostgreSQL)
GET /api/rooms/:code/state    saved game state
GET /api/rooms/:code/events   recent events
GET /api/history              finished matches from PostgreSQL
```

## 4. Project layout

```
├── shared/            types + constants used by BOTH sides
│   └── src/
│       ├── board.ts       room sizes + phase durations (NIGHT_MS/DAY_MS)
│       ├── cards.ts       (legacy data, unused by Mafia)
│       ├── avatars.ts     avatar + player colour pools
│       └── types.ts       GameState, RoomState, socket payloads, secret roles
├── server/
│   └── src/
│       ├── index.ts       Express + Socket.IO bootstrap
│       ├── config.ts      environment configuration
│       ├── game/engine.ts authoritative, pure Mafia rules (night/day/vote)
│       ├── rooms/roomManager.ts  room registry (code, seats, chat)
│       ├── socket/handlers.ts    every realtime event
│       ├── db/auth.ts     Google/Discord OAuth + sessions (users table)
│       └── db/            pool, embedded launcher, schema, repository
├── client/
│   └── src/
│       ├── context/SessionContext.tsx   socket + session state
│       ├── pages/Home.tsx               create / join lobby
│       ├── pages/RoomPage.tsx           lobby + live table
│       └── components/                  MafiaPanel, PlayerList, Chat, 3D table…
└── package.json       npm workspaces + dev scripts
```

## 5. How to play (Mafia)

1. **Create room** → pick a name and token → you get a 6-character invite code.
2. Friends open the code (or join from the *Open tables* list) and take a seat.
3. The host presses **Start game** once 2+ players are seated. Roles are dealt privately —
   only you see yours (Mafia, Doctor, Detective, Sheikh, Citizen).
4. **Night** (45s): Mafia picks a victim, Doctor saves one player, Detective investigates
   one player (result delivered privately), Sheikh shields one player with a single charge.
   The host can end the night early.
5. **Day** (60s): discuss in chat, then vote for the Mafia. Most-voted player is lynched
   (ties spare everyone); their role is revealed in the log.
6. **Win**: Mafia wins when no Mafia remain dead → town wins; Mafia wins when it can no
   longer be outvoted. The result is written to **Match history**.

### Roles

- **Mafia** — kills one player each night.
- **Doctor** — saves one player each night.
- **Detective** — investigates one player each night; learns if they are Mafia (private).
- **Sheikh** — shields one player; the shield breaks when it blocks a hit (1 charge).
- **Citizen** — no night power; finds and votes out the Mafia.
- Table sizes: 4p = 1 Mafia + Doctor + Detective; 8p+ = 2 Mafia + Sheikh.

### Automatic restore after a restart

Every action is persisted to PostgreSQL (rooms, players, full game snapshot **including
secret roles**, events and chat). On boot the server **rebuilds every
unfinished room** (`status IN ('lobby','playing')`) — clients reconnect and rejoin their seat
with the same alive/dead state, round, votes and log.

### Socket events

Client → server: `room:create`, `room:join`, `room:leave`, `room:start`, `room:kick`,
`mafia:night-action`, `mafia:vote`, `mafia:end-phase`,
`voice:join`, `voice:leave`, `voice:offer`, `voice:answer`, `voice:ice`, `chat:send`
Server → client: `state` (public room state, roles stripped), `private:profile` (only you),
`chat:message`, `notice` (detective result, toasts), `joined`,
`voice:peer-list`, `voice:peer-joined`, `voice:peer-left`, `voice:offer`, `voice:answer`,
`voice:ice`

### Accounts (Google / Discord)

Guest play works with no keys. To enable real sign-in, set in the server environment:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`,
`DISCORD_GUILD_ID` (see `.env.example`). Until keys exist, `/auth/google` and `/auth/discord`
answer 503 with setup instructions, and the Home screen shows Guest mode. Linked accounts
store their profile picture (Google/Discord avatar, Discord-style) in the `users` table and it
travels with you into every room as your avatar image.

## 5b. Voice chat (WebRTC)

Players in the same room can talk in real time using their microphones:

1. Click **🎤** in the Discord-style voice bar at the bottom of the table.
2. The browser asks for microphone permission — allow it.
3. Everyone who has enabled their mic can hear each other; a **green ring +
   mic badge** appears above each speaker's 3D character (red when muted).
4. **Mute/Unmute** (mic), **Deafen/Undeafen** (headphones) and **Settings**
   (input/output devices, volumes, mic test) are in the bottom bar.
5. Click the mic again to mute, or leave the room, to stop sending audio.

Technical notes:

- Audio flows **peer-to-peer** (WebRTC mesh) — the game server only relays tiny
  signaling messages (SDP offer/answer + ICE candidates) and the list of participants.
  No audio ever touches the server, so bandwidth and CPU stay low.
- Microphone access requires a **secure context**: `https://` in production (Render gives
  this for free) or `http://localhost` in development. Plain `http://` over a LAN IP
  will not work — use the tunnel or the deployed URL.
- Works on **PC and mobile** (Chrome, Edge, Safari, Firefox). Mobile browsers may need
  a user gesture (the *Enable mic* click) before audio can play.
- For players behind strict corporate/mobile NATs where STUN alone fails, set
  `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS` (or extend `ICE_SERVERS` in
  `client/src/lib/voice.ts`) — e.g. a free Metered.ca TURN server. The defaults use
  Google's public STUN servers.

## 6. Deploy online — Render (free) + Neon PostgreSQL (free)

The app runs as **one Render Web Service** serving both the API/Socket.IO and the built React
client, with **Neon** as the durable PostgreSQL. **100% free, no credit card, your PC
does not need to stay on.** Full step-by-step guide (including Google OAuth setup,
free keep-alive pinger and Hugging Face Spaces alternative):
see **[DEPLOY.md](./DEPLOY.md)**.

### 6.1 Create the Neon database (2 minutes)

1. Sign up at <https://neon.tech> → **New project** → name it `estate-empire`.
2. Neon creates a database (default `neondb`). Rename it to `estate`, or adjust the connection
   string — the app uses the database from the URL.
3. From the project dashboard, copy the **pooled** connection string, it looks like:
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.us-east-2.aws.neon.tech/estate?sslmode=require`
4. That's it — the schema is applied automatically on first boot (`CREATE TABLE IF NOT EXISTS`),
   and re-applied on every deploy (idempotent).

### 6.2 Push the repository to GitHub

```bash
git init
git add .
git commit -m "Estate Empire"
git branch -M main
git remote add origin https://github.com/<you>/estate-empire.git
git push -u origin main
```

(`.gitignore` already excludes `node_modules/`, `dist/`, `.pgdata/` — no secrets or binaries are committed.)

### 6.3 Create the Render Web Service

1. Sign up at <https://render.com> → **New +** → **Web Service** → select the GitHub repo.
2. Settings:

   | Setting | Value |
   | --- | --- |
   | Root directory | *(repository root)* |
   | Runtime | Node |
   | Build command | `npm ci && npm run build` |
   | Start command | `npm run start` |
   | Health check path | `/api/health` |
   | Plan | **Free** (sleeps after ~15 min idle; cold start ~30–60 s — see keep-alive note in DEPLOY.md) |
   | Auto-deploy | On |

3. **Environment variables**:

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the Neon pooled string from step 6.1 |
   | `EMBEDDED_PG` | `0` (never boot the bundled PG on Render) |

4. Click **Create Web Service**. Logs should show `connected to external PostgreSQL at ep-xxx…`
   (or `database ensured… restored N active room(s)`).
5. Open `https://<your-service>.onrender.com/api/health` → expect `"db":"external"`.
6. Share `https://<your-service>.onrender.com` — open it in two browsers and play.

### 6.4 Or use the blueprint

A ready-made [`render.yaml`](./render.yaml) is included: **Render → New → Blueprint**, point it at
the repo — it creates the service with the exact settings above. You only set `DATABASE_URL`
as a secret in the Render dashboard (it is marked `sync: false`).

### 6.5 Why this is safe to run permanently

- **Persistence**: rooms, players, decks, chat, events and finished matches live in Neon —
  deploys and restarts never lose a game; unfinished tables are rebuilt automatically at boot.
- **Fail-fast in production**: `NODE_ENV=production` + no reachable DB ⇒ the server refuses to
  start (it can never silently degrade to in-memory storage).
- **TLS/SSL**: Neon requires SSL; `DATABASE_URL` with `sslmode=require` is parsed automatically.
- **Health checks**: `/api/health` is light and side-effect free; Render restarts the dyno on failure.
- **Free tier caveat**: Render Free sleeps after ~15 min idle and cold-starts in ~30–60 s;
  ping `/api/health` every 5 min with a free uptime pinger (cron-job.org) to stay awake.
- **Custom domain**: optional, in the Render dashboard → *Settings → Custom Domains*.
- **Costs**: $0 — Render Free + Neon Free (0.5 GB is enough for hundreds of tables).

### 6.6 Local production rehearsal

```bash
npm run build          # client -> client/dist, server -> server/dist
npm run start          # serves everything on :4000 (embedded PostgreSQL)
```

To rehearse against Neon locally, set `DATABASE_URL` in your shell before `npm run start`.
