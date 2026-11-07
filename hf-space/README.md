---
title: SUPER NOVA Mafia
emoji: 🧟
colorFrom: red
colorTo: black
sdk: docker
app_file: Dockerfile
app_port: 7860
---

# SUPER NOVA — Mafia Online (Hugging Face Spaces, free — no credit card)

Real-time multiplayer Mafia (Node + Express + Socket.IO + React + PostgreSQL)
in one Docker container. Upload this `README.md` and the root `Dockerfile` to
the Space root, then set the variables below in
Space **Settings → Variables and secrets**.

## Env vars (never in code)
- `NODE_ENV=production`
- `REQUIRE_DB=1`
- `EMBEDDED_PG=0`
- `DATABASE_URL=<Neon pooled connection string>` (secret — free at neon.tech)
- `PUBLIC_ORIGIN=https://<you>-super-nova-mafia.hf.space`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional — guests play either
  way; when set, Google OAuth activates. Register the redirect URI
  `https://<you>-super-nova-mafia.hf.space/auth/google/callback` in Google Console)
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (optional)

## Notes
- The server reads `PORT` (Spaces injects 7860) and listens on `0.0.0.0`.
- Voice (WebRTC) is peer-to-peer with a public STUN + built-in free TURN
  fallback; the server only relays signaling. HTTPS is provided by Spaces,
  so the microphone works on iPhone/Android/desktop.
- Production requires a reachable PostgreSQL: the bundled embedded PG is
  disabled and the server refuses to start without `DATABASE_URL`.
- Free Spaces sleep after long inactivity and wake on the next visit; rooms
  and accounts live in Neon, so nothing is lost.
