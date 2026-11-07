/**
 * Shared Mafia constants (room sizes, auto phase durations).
 */

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;

/** Auto-advance: host can end earlier via the end-phase action. */
export const NIGHT_MS = 45_000;
export const DAY_MS = 60_000;
export const VOTE_MS = 30_000;
