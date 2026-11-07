# SUPER NOVA — Mafia Online · Deployment Guide (100% FREE, no credit card)

This turns SUPER NOVA into a real public online service: a permanent URL anyone
can open from any country, on iPhone, Android or desktop — while **your PC stays
off**. Everything below uses free tiers only. No card is ever requested.

---

## Architecture (what you're deploying)

| Piece | Where it runs | Cost |
|---|---|---|
| Game server + website (Node/Express + Socket.IO + React) | **Render** Free Web Service (Docker) | Free* |
| Database (accounts, rooms, game snapshots) | **Neon** PostgreSQL | Free |
| Voice chat (WebRTC) | Browser-to-browser (peer-to-peer); server only relays signaling | Free |
| Google sign-in (optional) | Google Cloud Console | Free |

\* Render's free tier **sleeps after ~15 minutes** without traffic and the first
visit after sleep takes ~30–60 s to wake. Rooms, accounts and progress are in
Neon, so a wake-up never loses anything. See "Keep it awake for free" below.

---

## Step 1 — Create the free Neon database (2 minutes)

1. Sign up at <https://neon.tech> (no card) → **New project** → name it `super-nova`.
2. Neon creates a database. From the dashboard copy the **pooled** connection
   string (**Connect → Connection string → pooled**), it looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Save it — you will paste it into Render in Step 3. The app creates all
   tables automatically on first boot; you run no SQL yourself.

---

## Step 2 — Push this repo to GitHub

```bash
cd C:\Users\ADAM\Desktop\HHHH
git init
git add -A
git commit -m "SUPER NOVA Mafia — online multiplayer"
git remote add origin https://github.com/<you>/super-nova-mafia.git
git branch -M main
git push -u origin main
```

(`.gitignore` + `.dockerignore` already exclude `node_modules/`, `dist/`,
`.pgdata/`, `.env`, zips and logs — no secrets or binaries are committed.)

---

## Step 3 — Deploy on Render (free)

1. Sign up at <https://render.com> (no card) → **New → Blueprint** → connect the
   GitHub repo. Render reads [`render.yaml`](./render.yaml) and creates the
   `super-nova-mafia` Docker web service on the **free** plan.
2. In the service dashboard → **Environment**, add these variables:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon pooled string from Step 1 (secret) |
   | `PUBLIC_ORIGIN` | `https://super-nova-mafia.onrender.com` (your real URL — see below) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *only after Step 5 — optional* |

3. Click **Deploy**. Render builds the Docker image (client + server) and starts
   it. In the logs you should see:
   ```
   [db] connected to external PostgreSQL at ep-…neon.tech…
   🎲 SUPER NOVA Mafia server is up
   http] serving built client from …
   ```
4. Your public URL is `https://super-nova-mafia.onrender.com` (Render may add a
   suffix). **Share this link with friends** — anyone in the world can open it.

> **Important:** if `DATABASE_URL` is missing, the server *refuses to start*
> (loud error, no silent in-memory fallback) — that is by design, so production
> data can never silently vanish.

---

## Step 4 — Verify the live service (2 minutes)

1. Open `https://<your-service>.onrender.com/api/health` → expect `"db":"external"`.
2. Open the game URL in **two browsers** (or phone + PC):
   - **Play as Guest** works immediately (no account needed), or sign in with
     Google if you finished Step 5.
   - Window A: create a room → copy the invite code/link.
   - Window B: join with the code → host clicks **Start game**.
3. Test **voice**: click the 🎤 mic button in the bottom voice bar, allow the
   microphone, talk — the other player hears you and the **green speaking ring**
   appears above your 3D character. Mute → the ring turns **red**.
4. Close one window, reopen it → you rejoin your seat; rooms survive restarts
   because they are restored from Neon.

---

## Step 5 — Enable Google sign-in (optional, free, ~5 minutes)

Guests play with or without this step. Google sign-in adds a stable identity and
your profile picture in every room.

1. Go to <https://console.cloud.google.com> → create a project (e.g. `super-nova`).
2. **APIs & Services → OAuth consent screen** → External → fill app name
   (`SUPER NOVA Mafia`) + your email → Save. (No verification needed for
   basic `openid profile email` scopes.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   application type **Web application**, name it `SUPER NOVA Web`.
4. Under **Authorized redirect URIs** add exactly:
   ```
   https://<your-service>.onrender.com/auth/google/callback
   ```
   (Copy/paste it — Google rejects the login with `redirect_uri_mismatch` if it
   differs by even one character.)
5. Copy the **Client ID** and **Client secret** → in Render → Environment add
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` → **Deploy** again.
6. Test: open the game → **Continue with Google** → sign in → your name/photo
   appear in the room. Guests still work alongside Google accounts.

> Discord sign-in works the same way (discord.com/developers → redirect URI
> `https://<your-service>.onrender.com/auth/discord/callback`).

---

## Keep it awake for free (optional)

Render Free sleeps after ~15 min idle; the next visitor waits ~30–60 s for the
cold start, then everything works normally (rooms are restored from Neon).

To avoid the sleep entirely, point a free uptime pinger at your health endpoint
every 5 minutes — e.g. <https://cron-job.org> or UptimeRobot (free tier):
```
GET https://<your-service>.onrender.com/api/health   every 5 minutes
```
No account/card for the pinger either way.

---

## Alternative host: Hugging Face Spaces (also free, no card)

1. Create a free account at <https://huggingface.co>.
2. **New Space** → name `super-nova-mafia` → SDK **Docker**.
3. Upload the two files from the [`hf-space/`](./hf-space) folder to the Space
   root: `Dockerfile` and `README.md` (the README carries the Space metadata).
4. Space **Settings → Variables and secrets** → `DATABASE_URL` (Neon string),
   `PUBLIC_ORIGIN` (the `*.hf.space` URL), optionally the Google keys.
5. The Space builds and serves the game at
   `https://<you>-super-nova-mafia.hf.space`. Free Spaces sleep after long
   inactivity (48 h) and wake on the next visit.

---

## Voice chat & mobile notes

- **HTTPS is required for the microphone** — both Render and HF Spaces give you
  free HTTPS certificates, so voice works on iPhone/Android/desktop browsers
  (Chrome, Edge, Safari, Firefox). On iOS, tap the mic button once and allow
  the permission; audio starts after that tap.
- Audio is **peer-to-peer WebRTC**: the server only relays tiny signaling
  messages, so voice costs nothing and stays fast even on the free tier.
- If a player is behind a very strict mobile/corporate NAT and STUN alone
  fails, point the client at a free TURN server with `VITE_TURN_URL`,
  `VITE_TURN_USER`, `VITE_TURN_PASS` **at build time** (Dockerfile build arg /
  Render build env), or extend `ICE_SERVERS` in `client/src/lib/voice.ts`.
- The layout is responsive (touch targets, safe-area insets, adaptive 3D
  canvas) for phones in portrait and landscape.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| Server crashes: "Production requires a reachable PostgreSQL" | `DATABASE_URL` missing/wrong — set the Neon pooled string in Render env and redeploy. |
| `redirect_uri_mismatch` on Google login | The URI registered in Google Console must be byte-identical to `https://<your-service>/auth/google/callback`. Set `PUBLIC_ORIGIN` too. |
| First visit is very slow (~1 min) | Free tier cold start after sleep — normal. Use the keep-alive pinger above, or just wait and reload. |
| Mic doesn't work / no prompt | Open the game over **https** (not a LAN `http://` IP) and allow mic permission in the browser. |
| Two players can't hear each other on some networks | Add a TURN server (`VITE_TURN_URL`…) as described above. |
| Room disappeared after redeploy | Should not happen (Neon-backed) — check `/api/health` shows `"db":"external"`. |

---

## What was checked before delivery

- `npm run typecheck` ✅ · `npm run build` (client + server) ✅
- Production server boots and serves the built client + `/api/health` on one origin ✅
- Guest play works **with and without** Google keys; Google OAuth redirect URI
  honors `GOOGLE_REDIRECT_URI` / `PUBLIC_ORIGIN` ✅
- `.dockerignore` excludes `.env`, `.pgdata`, `node_modules`, `dist`, zips ✅
- Rooms/accounts persist in PostgreSQL and unfinished rooms are restored on boot ✅
