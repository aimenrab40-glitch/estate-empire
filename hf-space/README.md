---
title: SUPER NOVA Mafia
emoji: 🧟
colorFrom: red
colorTo: black
sdk: docker
app_file: Dockerfile
app_port: 7860
---

# SUPER NOVA — Mafia Online (Hugging Face Spaces)

Real-time multiplayer Mafia social game (Node + Express + Socket.IO + React) inside Docker.
Runs free on HF Spaces (no credit card).

## Env vars required (set in Space Settings → Variables and secrets)
- `NODE_ENV=production`
- `DATABASE_URL=<Neon pooled string>` (secret)
- `REQUIRE_DB=1`
- `EMBEDDED_PG=0`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional — when set, Google OAuth login activates)
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (optional)

The server listens on `0.0.0.0:$PORT` and serves the client + REST + Socket.IO on one origin.
