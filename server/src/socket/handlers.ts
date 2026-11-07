import type { Server, Socket } from 'socket.io';
import {
  C2S,
  S2C,
  type Ack,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type JoinResult,
} from '../../../shared/src/types.js';
import {
  GameError,
  endPhase,
  isPhaseDue,
  nightAction,
  resolveNight,
  resolveVote,
  vote,
} from '../game/engine.js';
import {
  createRoom,
  getPrivateProfile,
  getRoom,
  joinRoom,
  leaveRoom,
  markFinished,
  normalizeCode,
  pushChat,
  sanitizeAvatar,
  startRoomGame,
  toRoomState,
  type Room,
} from '../rooms/roomManager.js';
import { finishMatch, persistEvent, persistGameContext, persistPlayer, persistRoom, removePlayer } from '../db/repo.js';

const socketByPlayer = new Map<string, string>();

export function registerSocketHandlers(io: Server) {
  const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const voiceParticipants = new Map<string, Set<string>>();
  /** Last broadcast mute/deafen state per voice participant (for the red mic badge). */
  const voiceStates = new Map<string, Map<string, { muted: boolean; deafened: boolean }>>();

  const leaveVoice = (code: string, playerId: string) => {
    const set = voiceParticipants.get(code);
    if (!set || !set.has(playerId)) return;
    set.delete(playerId);
    if (set.size === 0) voiceParticipants.delete(code);
    const states = voiceStates.get(code);
    if (states) {
      states.delete(playerId);
      if (states.size === 0) voiceStates.delete(code);
    }
    io.to(roomKey(code)).emit(S2C.voicePeerLeft, { peerId: playerId });
    io.to(roomKey(code)).emit(S2C.voiceState, { peerId: playerId, muted: false, deafened: false });
  };

  const broadcast = (room: Room) => {
    io.to(roomKey(room.code)).emit(S2C.state, toRoomState(room));
  };

  const sendPrivateProfile = (room: Room, playerId: string) => {
    const profile = getPrivateProfile(room.code, playerId);
    if (!profile) return;
    const socketId = socketByPlayer.get(playerId);
    if (socketId) io.to(socketId).emit(S2C.privateProfile, profile);
  };

  const sendPrivateProfiles = (room: Room) => {
    for (const p of room.game.state.players) sendPrivateProfile(room, p.id);
  };

  const roomKey = (code: string) => `room:${code}`;

  const persistAll = async (room: Room, type: string, payload: unknown) => {
    await persistGameContext(room.code, room.game.state, room.game.roles);
    await persistEvent(room.code, type, payload);
    if (markFinished(room)) {
      const s = room.game.state;
      await finishMatch(
        room.code,
        room.name,
        s.winnerId ? s.players.find((p) => p.id === s.winnerId)?.name ?? null : null,
        s.players.length,
        s.round,
        s.startedAt,
      );
      await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'finished');
    }
  };

  const schedulePhase = (room: Room) => {
    const existing = phaseTimers.get(room.code);
    if (existing) {
      clearTimeout(existing);
      phaseTimers.delete(room.code);
    }
    const endsAt = room.game.state.phaseEndsAt;
    const phase = room.game.state.phase;
    if (!endsAt || (phase !== 'night' && phase !== 'day')) return;
    const delay = Math.max(0, endsAt - Date.now()) + 100;
    const timer = setTimeout(async () => {
      phaseTimers.delete(room.code);
      const live = getRoom(room.code);
      if (!live || !isPhaseDue(live.game.state)) return;
      try {
        if (live.game.state.phase === 'night') live.game = resolveNight(live.game);
        else if (live.game.state.phase === 'day') live.game = resolveVote(live.game);
        await persistAll(live, 'phase-auto', { from: phase });
        schedulePhase(live);
        broadcast(live);
        sendPrivateProfiles(live);
      } catch (err) {
        console.error('[socket] auto phase failed:', err);
      }
    }, delay);
    timer.unref?.();
    phaseTimers.set(room.code, timer);
  };

  const afterAction = async (room: Room, type: string, payload: unknown) => {
    await persistAll(room, type, payload);
    schedulePhase(room);
    broadcast(room);
  };

  const fail = <T>(socket: Socket, ack: Ack<T> | undefined, err: unknown): void => {
    const message = err instanceof GameError ? err.message : 'Unexpected server error.';
    if (!(err instanceof GameError)) console.error('[socket] action failed:', err);
    ack?.({ ok: false, error: message });
  };

  const bindRoom = (socket: Socket, room: Room) => {
    socket.join(roomKey(room.code));
    socket.data.roomCode = room.code;
  };

  io.on('connection', (socket) => {
    let myCode: string | null = null;
    let myId: string | null = null;

    const currentRoom = (): Room | undefined => (myCode ? getRoom(myCode) : undefined);

    socket.on(C2S.create, async (payload: CreateRoomPayload & { image?: string | null; userId?: string }, ack?: Ack<JoinResult>) => {
      try {
        const { room } = createRoom({
          name: payload?.name ?? '',
          avatar: sanitizeAvatar(payload?.avatar),
          maxPlayers: Number(payload?.maxPlayers) || 4,
          roomName: payload?.roomName,
        });
        myCode = room.code;
        myId = payload?.userId ?? room.hostId;
        const seatPlayer = room.game.state.players[0];
        if (payload?.userId) seatPlayer.id = payload.userId;
        if (payload?.image) seatPlayer.avatarUrl = payload.image;
        myId = seatPlayer.id;
        room.hostId = seatPlayer.id;
        bindRoom(socket, room);
        socketByPlayer.set(myId, socket.id);
        await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'lobby');
        await persistPlayer(room.code, { id: seatPlayer.id, name: seatPlayer.name, avatar: seatPlayer.avatar, image: seatPlayer.avatarUrl ?? null, color: seatPlayer.color, seat: 0 });
        broadcast(room);
        sendPrivateProfile(room, myId);
        ack?.({ ok: true, data: { code: room.code, playerId: myId } });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.join, async (payload: JoinRoomPayload & { userId?: string; image?: string | null }, ack?: Ack<JoinResult>) => {
      try {
        const { room, playerId } = await joinRoom(payload?.code ?? '', {
          name: payload?.name,
          avatar: payload?.avatar ? sanitizeAvatar(payload.avatar) : undefined,
          playerId: payload?.playerId ?? payload?.userId,
          image: payload?.image ?? null,
        });
        myCode = room.code;
        myId = playerId;
        bindRoom(socket, room);
        socketByPlayer.set(playerId, socket.id);
        broadcast(room);
        sendPrivateProfile(room, playerId);
        ack?.({ ok: true, data: { code: room.code, playerId } });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.leave, async (_payload: unknown, ack?: Ack) => {
      try {
        const room = currentRoom();
        if (room && myId) {
          socket.leave(roomKey(room.code));
          const remaining = leaveRoom(room.code, myId);
          socketByPlayer.delete(myId);
          leaveVoice(room.code, myId);
          await removePlayer(myId);
          if (remaining) {
            await persistRoom(remaining.code, remaining.name, remaining.maxPlayers, remaining.hostId, remaining.status);
            await persistGameContext(remaining.code, remaining.game.state, remaining.game.roles);
            broadcast(remaining);
          }
        }
        myCode = null;
        myId = null;
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.start, async (_payload: unknown, ack?: Ack) => {
      try {
        const room = currentRoom();
        if (!room || !myId) throw new GameError('You are not in this room.');
        startRoomGame(room.code, myId);
        await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'playing');
        await afterAction(room, 'start', { by: myId });
        sendPrivateProfiles(room);
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    // Accepts both the new shape { kind, targetId } and the compact { targetId }
    // (kind inferred from the actor's secret role).
    socket.on(C2S.nightAction, async (payload: { kind?: string; targetId?: string | null }, ack?: Ack) => {
      try {
        const room = currentRoom();
        if (!room || !myId) throw new GameError('Room not found.');
        const targetId = payload?.targetId ?? null;
        if (!targetId) throw new GameError('Choose a player first.');
        const actorRole = room.game.roles[myId];
        const kind = (payload?.kind as 'kill' | 'save' | 'investigate' | 'shield' | undefined)
          ?? (actorRole === 'mafia' ? 'kill' : actorRole === 'doctor' ? 'save' : actorRole === 'detective' ? 'investigate' : actorRole === 'sheikh' ? 'shield' : actorRole === 'elder' ? 'shield' : 'investigate');
        const res = nightAction(room.game, myId, kind, targetId);
        room.game = res.ctx;
        await afterAction(room, 'night-action', { by: myId, kind });
        if (res.investigationResult) {
          const socketId = socketByPlayer.get(myId);
          if (socketId) {
            io.to(socketId).emit(S2C.notice, {
              type: 'info',
              message: `🔍 ${res.investigationResult.targetName} is ${res.investigationResult.isMafia ? 'Mafia 🥀' : 'not Mafia'}.`,
            });
          }
        }
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.vote, async (payload: { targetId?: string | null }, ack?: Ack) => {
      try {
        const room = currentRoom();
        if (!room || !myId) throw new GameError('Room not found.');
        room.game = vote(room.game, myId, payload?.targetId ? String(payload.targetId) : null);
        await afterAction(room, 'vote', { by: myId });
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.endPhase, async (_payload: unknown, ack?: Ack) => {
      try {
        const room = currentRoom();
        if (!room || !myId) throw new GameError('Room not found.');
        room.game = endPhase(room.game, myId);
        await afterAction(room, 'end-phase', { by: myId });
        sendPrivateProfiles(room);
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.kick, async (payload: { targetId?: string }, ack?: Ack) => {
      try {
        const room = currentRoom();
        const kickerId = myId;
        const targetId = payload?.targetId;
        if (!room || !kickerId || !targetId) throw new GameError('Room not found.');
        if (room.hostId !== kickerId) throw new GameError('Only the host can kick a player.');
        if (targetId === kickerId) throw new GameError('You cannot kick yourself.');
        if (room.status !== 'lobby') throw new GameError('Players cannot be kicked mid-game.');
        const remaining = leaveRoom(room.code, targetId);
        const targetSocket = socketByPlayer.get(targetId);
        socketByPlayer.delete(targetId);
        await removePlayer(targetId);
        if (targetSocket) {
          const s = io.sockets.sockets.get(targetSocket);
          s?.emit(S2C.notice, { type: 'error', message: 'You were removed from the room by the host.' });
          s?.leave(roomKey(room.code));
        }
        if (remaining) {
          await persistRoom(remaining.code, remaining.name, remaining.maxPlayers, remaining.hostId, remaining.status);
          await persistGameContext(remaining.code, remaining.game.state, remaining.game.roles);
          broadcast(remaining);
        }
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.rename, async (payload: { name?: string }, ack?: Ack) => {
      try {
        const room = currentRoom();
        if (!room || !myId) throw new GameError('Room not found.');
        if (room.hostId !== myId) throw new GameError('Only the host can rename the table.');
        const name = String(payload?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
        if (!name) throw new GameError('Name cannot be empty.');
        room.name = name;
        const { persistRoom } = await import('../db/repo.js');
        await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, room.status);
        broadcast(room);
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.chat, (payload: { text?: string }) => {
      const room = currentRoom();
      if (!room || !myId) return;
      const player = room.game.state.players.find((p) => p.id === myId);
      const text = String(payload?.text ?? '').trim();
      if (!player || !text) return;
      const msg = pushChat(room, player, text);
      io.to(roomKey(room.code)).emit(S2C.chat, msg);
      void persistEvent(room.code, 'chat', msg);
    });

    socket.on(C2S.voiceJoin, (payload: { code?: string; playerId?: string }, ack?: Ack<string[]>) => {
      const code = normalizeCode(payload?.code ?? myCode ?? '');
      const playerId = payload?.playerId ?? myId;
      if (!code || !playerId) {
        ack?.({ ok: false, error: 'Not in a room.' });
        return;
      }
      let set = voiceParticipants.get(code);
      if (!set) {
        set = new Set();
        voiceParticipants.set(code, set);
      }
      const others = [...set];
      set.add(playerId);
      io.to(roomKey(code)).emit(S2C.voicePeerJoined, { peerId: playerId });
      // Send the joiner the current mute/deafen states so the red mic badges
      // are correct from the first second (Discord-style presence).
      const states = voiceStates.get(code);
      socket.emit(S2C.voiceStates, {
        states: states ? [...states.entries()].map(([id, s]) => ({ peerId: id, ...s })) : [],
      });
      ack?.({ ok: true, data: others });
    });

    socket.on(C2S.voiceState, (payload: { muted?: boolean; deafened?: boolean }) => {
      if (!myCode || !myId) return;
      const entry = { muted: Boolean(payload?.muted), deafened: Boolean(payload?.deafened) };
      let states = voiceStates.get(myCode);
      if (!states) {
        states = new Map();
        voiceStates.set(myCode, states);
      }
      states.set(myId, entry);
      io.to(roomKey(myCode)).emit(S2C.voiceState, { peerId: myId, ...entry });
    });

    socket.on(C2S.voiceLeave, (_payload: unknown, ack?: Ack) => {
      if (myCode && myId) leaveVoice(myCode, myId);
      ack?.({ ok: true });
    });

    const relayVoice = (event: string) => {
      socket.on(event, (payload: { to?: string; sdp?: unknown; candidate?: unknown }) => {
        const targetId = payload?.to;
        if (!targetId || !myId) return;
        const targetSocket = socketByPlayer.get(targetId);
        if (!targetSocket) return;
        io.to(targetSocket).emit(event, { from: myId, ...(payload ?? {}) });
      });
    };
    relayVoice(C2S.voiceOffer);
    relayVoice(C2S.voiceAnswer);
    relayVoice(C2S.voiceIce);

    socket.on('disconnect', async () => {
      if (myId) socketByPlayer.delete(myId);
      if (myCode && myId) leaveVoice(myCode, myId);
      if (!myCode || !myId) return;
      const room = getRoom(myCode);
      if (!room) return;
      const player = room.game.state.players.find((p) => p.id === myId);
      if (!player) return;
      player.connected = false;
      broadcast(room);
      await persistGameContext(room.code, room.game.state, room.game.roles).catch(() => undefined);
    });
  });
}

export function resetSocketMaps() {
  socketByPlayer.clear();
}
