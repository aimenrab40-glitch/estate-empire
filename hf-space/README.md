# SUPER NOVA — Hugging Face Spaces (free, no credit card)

The Space runs the **repository root** with Docker. Publish this repo to a Space
(`sdk: docker`, `app_file: Dockerfile`, `app_port: 7860`) — the frontmatter in
the root `README.md` already describes that.

## Env vars (Space Settings → Variables and secrets — never in code)
- `NODE_ENV=production`
- `REQUIRE_DB=1`
- `EMBEDDED_PG=0`
- `DATABASE_URL=<Neon pooled connection string>` (secret)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional — activates Google OAuth)
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (optional — activates Discord linking)
- `NO_AUTH=1` — LOCAL TESTING ONLY (guest mode; never in production)

## Notes
- The server reads `PORT` (Spaces injects 7860) and listens on `0.0.0.0`.
- Voice (WebRTC) uses a public STUN + optional TURN (`VITE_TURN_*` at build time,
  or the built-in free relay fallback).
- Production requires a reachable PostgreSQL: the bundled embedded PG is disabled
  and the server refuses to start without `DATABASE_URL`.
