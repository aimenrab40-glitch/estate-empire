import { io, Socket } from 'socket.io-client';

function guestAuth(): Record<string, string> {
  try {
    const raw = localStorage.getItem('supernova.guest.v1');
    if (raw) {
      const parsed = JSON.parse(raw) as { userId?: string; userName?: string };
      return { userId: parsed.userId ?? '', userName: parsed.userName ?? '' };
    }
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Single shared Socket.IO client. Same-origin deployment serves page + socket,
 * so the OAuth session cookie automatically authenticates the handshake.
 * In local guest mode (NO_AUTH=1) the guest id travels in handshake auth.
 */
export const socket: Socket = io({
  autoConnect: false,
  withCredentials: true,
  auth: guestAuth(),
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 5000,
  timeout: 10_000,
  transports: ['websocket', 'polling'],
});

export function connectSocket() {
  if (!socket.connected) socket.connect();
}
