import { io, Socket } from 'socket.io-client';

/**
 * Single shared Socket.IO client. The Vite dev server proxies /socket.io to
 * the game server, so in production the page and the socket share an origin.
 */
export const socket: Socket = io({
  autoConnect: false,
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
