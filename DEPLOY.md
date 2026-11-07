# Estate Empire — Deployment Guide (Render + Neon)

This turns Estate Empire into a real, always-on online service reachable at a
permanent public URL. Nothing runs on your personal PC.

## What was built
- **Server** (Node + Express + Socket.IO + PostgreSQL) — authoritative game
  engine, rooms, chat, persistence, auto-recovery.
- **Client** (React + Tailwind + Vite) — Richup.io-style board, animated dice,
  per-player tokens, real-time sync.
- **Database** — Neon PostgreSQL (rooms, players, game snapshots, match
  history).

## Requirements
- A **GitHub** account (push this repo there).
- A **Render** account (render.com) — hosts the web service.
- A **Neon** account (neon.tech) — provides the always-on PostgreSQL.

Neon has a generous free tier and gives you a single `DATABASE_URL` connection
string.

---

## Step 1 — Create the Neon database

1. Sign in to Neon and create a project (e.g. `estate-empire`).
2. In the project dashboard, copy the connection string under
   **Connect** → **Connection string** → **Node.js**. It looks like:

   ```
   postgres://<user>:<password>@ep-<id>.<region>.aws.neon.tech:5432/<db>?sslmode=require
   ```

3. Save it — you'll paste it into Render as `DATABASE_URL`.

---

## Step 2 — Push this repo to GitHub

```bash
cd C:\Users\ADAM\Desktop\HHHH
git init
git add -A
git commit -m "Estate Empire — online multiplayer board game"
git remote add origin https://github.com/<you>/estate-empire.git
git branch -M main
git push -u origin main
```

---

## Step 3 — Deploy the web service on Render

1. Log in to Render and click **New → Web Service**.
2. Connect your GitHub repo `estate-empire`.
3. Render detects `render.yaml`. Use these settings:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `node server/dist/server/src/index.js`
   - **Instance type:** Starter or higher (the free tier sleeps after inactivity;
     a paid instance stays awake **24/7**).
4. Add environment variables:
   - `DATABASE_URL` = your Neon connection string (from Step 1)
   - `NODE_ENV` = `production`
   - `REQUIRE_DB` = `1`
   - `PORT` = `4000`
5. Click **Deploy**.

Render builds the client + server, starts the server, and provisions a public
URL such as:

```
https://estate-empire-xxxx.onrender.com
```

That URL is permanent and anyone can open it to create or join rooms — your PC
does not need to be on.

---

## Step 4 — Verify the live service

1. Open the Render URL in two browser windows.
2. Window A: create a room → get the invite code/link.
3. Window B: join with the code.
4. Window A (host): click **Start game**.
5. Roll dice, buy properties, chat — positions sync in real time across both
   windows.
6. Refresh/close one window and reopen it with the same session — the player
   reconnects to the in-progress game (reconnect + PostgreSQL restore).

---

## How the requirements are met

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | Deploy backend to cloud | Render Web Service (`render.yaml`, `Dockerfile`) |
| 2 | Server runs continuously | Paid Render instance (never sleeps) + graceful SIGTERM shutdown |
| 3 | Create/join rooms anytime | REST + Socket.IO, room codes, invite links |
| 4 | Rooms stay active while connected | Socket.IO rooms, server-authoritative state |
| 5 | Save progress in PostgreSQL | Neon via `DATABASE_URL`; rooms/players/snapshots/history persisted |
| 6 | Disconnect → reconnect & continue | Socket.IO auto-reconnect + server rehydrates room from DB after restart |
| 7 | Real-time sync | Socket.IO broadcasts state on every action |
| 8 | Auto recovery + error handling | DB auto-migrate on boot, graceful shutdown, error toasts, no silent memory fallback in prod |
| 9 | Your PC doesn't stay on | Runs on Render's servers |
| 10 | Permanent URL | Render gives a public `*.onrender.com` URL |

---

## Production safety (no silent memory fallback)

The server **refuses to start** in production unless a PostgreSQL is reachable
(`REQUIRE_DB=1` / `DATABASE_URL` set). There is no silent in-memory fallback:
rooms and matches always survive a restart because they are restored from the
database.

## Files added for deployment

- `render.yaml` — Render blueprint
- `Dockerfile` — alternative container build (any host)
- `.env.example` — environment variable template
- `DEPLOY.md` — this guide
