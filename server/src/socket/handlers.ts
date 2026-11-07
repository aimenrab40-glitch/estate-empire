import type { Server, Socket } from 'socket.io';
import {
  C2S,
  S2C,
  type Ack,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type JoinResult,
} from '../../../shared/src/types.js';
import type { GameContext } from '../game/engine.js';
import {
  GameError,
  AUCTION_MS,
  bid as bidAction,
  buildOn,
  buyPending,
  endTurn,
  isAuctionDue,
  mortgageTile,
  passBuy,
  payBail,
  rollDice,
  sellBuilding,
  setRules,
  settleAuction,
  unmortgageTile,
} from '../game/engine.js';
import {
  createRoom,
  destroyRoom,
  getPrivateProfile,
  getRoom,
  joinRoom,
  leaveRoom,
  markFinished,
  normalizeCode,
  pushChat,
  sanitizeAvatar,
  sanitizeName,
  startRoomGame,
  toRoomState,
  type Room,
} from '../rooms/roomManager.js';
import {
  finishMatch,
  persistEvent,
  persistGameContext,
  persistPlayer,
  persistRoom,
  removePlayer,
} from '../db/repo.js';

/** socketId lookup per player so we can force-disconnect kicked players. */
const socketByPlayer = new Map<string, string>();

const diceRng = () => (process.env.DICE_MODE === 'fixed' ? 0.4 : Math.random());

export function registerSocketHandlers(io: Server) {
  const auctionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Voice participants per room (ephemeral, signaling only — audio is P2P). */
  const voiceParticipants = new Map<string, Set<string>>();
  const leaveVoice = (code: string, playerId: string) => {
    const set = voiceParticipants.get(code);
    if (!set || !set.has(playerId)) return;
    set.delete(playerId);
    if (set.size === 0) voiceParticipants.delete(code);
    io.to(roomKey(code)).emit(S2C.voicePeerLeft, { peerId: playerId });
  };

  const broadcast = (room: Room) => {
    io.to(roomKey(room.code)).emit(S2C.state, toRoomState(room));
  };

  /**
   * PRIVATE delivery: send a player's own username + secret role ONLY to that
   * player's socket. Never use room broadcast here — other clients must never
   * receive another player's private details.
   */
  const sendPrivateProfile = (room: Room, playerId: string) => {
    const profile = getPrivateProfile(room.code, playerId);
    if (!profile) return;
    const socketId = socketByPlayer.get(playerId);
    if (socketId) io.to(socketId).emit(S2C.privateProfile, profile);
  };

  /** Unicast each player's private profile to its own socket (start/reconnect). */
  const sendPrivateProfiles = (room: Room) => {
    for (const p of room.game.state.players) sendPrivateProfile(room, p.id);
  };

  const roomKey = (code: string) => `room:${code}`;

  const persistAll = async (room: Room, type: string, payload: unknown) => {
    const { state, chanceDeck, chestDeck } = room.game;
    await persistGameContext(room.code, state, chanceDeck, chestDeck);
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

  /** Keeps a single countdown per room for the open auction (if any). */
  const scheduleAuction = (room: Room) => {
    const existing = auctionTimers.get(room.code);
    if (existing) {
      clearTimeout(existing);
      auctionTimers.delete(room.code);
    }
    const auction = room.game.state.auction;
    if (!auction || room.game.state.phase !== 'playing') return;

    const delay = Math.max(0, auction.endsAt - Date.now()) + 25;
    const timer = setTimeout(async () => {
      auctionTimers.delete(room.code);
      const live = getRoom(room.code);
      if (!live?.game.state.auction) return;
      if (live.game.state.auction.endsAt > Date.now()) {
        // A bid refreshed the clock after this timer was armed.
        scheduleAuction(live);
        return;
      }
      const tile = live.game.state.auction.tile;
      live.game = settleAuction(live.game);
      await persistAll(live, 'auction-settled', { tile });
      broadcast(live);
    }, delay);
    timer.unref?.();
    auctionTimers.set(room.code, timer);
  };

  const afterAction = async (room: Room, type: string, payload: unknown) => {
    await persistAll(room, type, payload);
    scheduleAuction(room);
    broadcast(room);
  };

  const fail = <T>(socket: Socket, ack: Ack<T> | undefined, err: unknown): void => {
    const message = err instanceof GameError ? err.message : 'Unexpected server error.';
    if (!(err instanceof GameError)) console.error('[socket] action failed:', err);
    // Errors travel back through the acknowledgement so the UI can show them once.
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

    /* ------------------------------- lobby ------------------------------- */

    socket.on(C2S.create, async (payload: CreateRoomPayload, ack?: Ack<JoinResult>) => {
      try {
        const { room, playerId } = createRoom({
          name: payload?.name ?? '',
          avatar: sanitizeAvatar(payload?.avatar),
          maxPlayers: Number(payload?.maxPlayers) || 6,
          roomName: payload?.roomName,
          rules: payload?.rules,
        });
        myCode = room.code;
        myId = playerId;
        bindRoom(socket, room);
        socketByPlayer.set(playerId, socket.id);

        await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'lobby');
        const p = room.game.state.players[0];
        await persistPlayer(room.code, {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          color: p.color,
          seat: 0,
        });
        broadcast(room);
        sendPrivateProfile(room, playerId);
        ack?.({ ok: true, data: { code: room.code, playerId } });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.join, async (payload: JoinRoomPayload, ack?: Ack<JoinResult>) => {
      try {
        const { room, playerId, reconnected } = await joinRoom(payload?.code ?? '', {
          name: payload?.name,
          avatar: payload?.avatar ? sanitizeAvatar(payload.avatar) : undefined,
          playerId: payload?.playerId,
        });
        myCode = room.code;
        myId = playerId;
        bindRoom(socket, room);
        socketByPlayer.set(playerId, socket.id);

        if (!reconnected) {
          const seat = room.game.state.players.findIndex((p) => p.id === playerId);
          const p = room.game.state.players[seat];
          await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'lobby');
          await persistPlayer(room.code, {
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            color: p.color,
            seat,
          });
        } else {
          await persistEvent(room.code, 'reconnect', { playerId });
        }
        // Resume an auction whose clock ran out while the server was down.
        if (room.game.state.auction && isAuctionDue(room.game.state)) {
          scheduleAuction(room);
        }
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
            await persistRoom(
              remaining.code,
              remaining.name,
              remaining.maxPlayers,
              remaining.hostId,
              remaining.status,
            );
            await persistGameContext(
              remaining.code,
              remaining.game.state,
              remaining.game.chanceDeck,
              remaining.game.chestDeck,
            );
            broadcast(remaining);
          } else {
            await persistEvent(room.code, 'room-closed', { reason: 'empty' });
          }
        }
        myCode = null;
        myId = null;
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(
      C2S.start,
      async (payload: { code?: string; playerId?: string }, ack?: Ack) => {
        try {
          const code = normalizeCode(payload?.code ?? myCode ?? '');
          const room = getRoom(code);
          if (!room) throw new GameError('Room not found.');
          const playerId = payload?.playerId ?? myId;
          if (!playerId) throw new GameError('You are not in this room.');
          startRoomGame(code, playerId);
          await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'playing');
          await afterAction(room, 'start', { by: playerId });
          // Secret roles just assigned — deliver each one privately to its owner.
          sendPrivateProfiles(room);
          ack?.({ ok: true });
        } catch (err) {
          fail(socket, ack, err);
        }
      },
    );

    /* -------------------------------- game -------------------------------- */

    socket.on(C2S.roll, async (payload: { code?: string; playerId?: string }, ack?: Ack) => {
      try {
        const code = normalizeCode(payload?.code ?? myCode ?? '');
        const room = getRoom(code);
        const playerId = payload?.playerId ?? myId;
        if (!room || !playerId) throw new GameError('Room not found.');
        room.game = rollDice(room.game, playerId, diceRng);
        await afterAction(room, 'roll', { playerId, dice: room.game.state.dice });
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.buy, async (payload: { code?: string; playerId?: string }, ack?: Ack) => {
      try {
        const code = normalizeCode(payload?.code ?? myCode ?? '');
        const room = getRoom(code);
        const playerId = payload?.playerId ?? myId;
        if (!room || !playerId) throw new GameError('Room not found.');
        const tile = room.game.state.pendingTile;
        room.game = buyPending(room.game, playerId);
        await afterAction(room, 'buy', { playerId, tile });
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(C2S.pass, async (payload: { code?: string; playerId?: string }, ack?: Ack) => {
      try {
        const code = normalizeCode(payload?.code ?? myCode ?? '');
        const room = getRoom(code);
        const playerId = payload?.playerId ?? myId;
        if (!room || !playerId) throw new GameError('Room not found.');
        room.game = passBuy(room.game, playerId);
        await afterAction(room, 'pass', { playerId });
        ack?.({ ok: true });
      } catch (err) {
        fail(socket, ack, err);
      }
    });

    socket.on(
      C2S.endTurn,
      async (payload: { code?: string; playerId?: string }, ack?: Ack) => {
        try {
          const code = normalizeCode(payload?.code ?? myCode ?? '');
          const room = getRoom(code);
          const playerId = payload?.playerId ?? myId;
          if (!room || !playerId) throw new GameError('Room not found.');
          room.game = endTurn(room.game, playerId);
          await afterAction(room, 'end-turn', { playerId });
          ack?.({ ok: true });
        } catch (err) {
          fail(socket, ack, err);
        }
      },
    );

    socket.on(
      'game:pay-bail',
      async (payload: { code?: string; playerId?: string }, ack?: Ack) => {
        try {
          const code = normalizeCode(payload?.code ?? myCode ?? '');
          const room = getRoom(code);
          const playerId = payload?.playerId ?? myId;
          if (!room || !playerId) throw new GameError('Room not found.');
          room.game = payBail(room.game, playerId);
          await afterAction(room, 'pay-bail', { playerId });
          ack?.({ ok: true });
        } catch (err) {
          fail(socket, ack, err);
        }
      },
    );

    socket.on(
      C2S.bid,
      async (payload: { code?: string; playerId?: string; amount?: number }, ack?: Ack) => {
        try {
          const code = normalizeCode(payload?.code ?? myCode ?? '');
          const room = getRoom(code);
          const playerId = payload?.playerId ?? myId;
          if (!room || !playerId) throw new GameError('Room not found.');
          room.game = bidAction(room.game, playerId, Number(payload?.amount));
          await afterAction(room, 'bid', { playerId, amount: payload?.amount });
          ack?.({ ok: true });
        } catch (err) {
          fail(socket, ack, err);
        }
      },
    );

    socket.on(
      C2S.rules,
      async (
        payload: { code?: string; playerId?: string; rules?: Record<string, unknown> },
        ack?: Ack,
      ) => {
        try {
          const code = normalizeCode(payload?.code ?? myCode ?? '');
          const room = getRoom(code);
          const playerId = payload?.playerId ?? myId;
          if (!room || !playerId) throw new GameError('Room not found.');
          room.game = setRules(room.game, playerId, payload?.rules ?? {});
          await afterAction(room, 'rules', { playerId, rules: room.game.state.rules });
          ack?.({ ok: true });
        } catch (err) {
          fail(socket, ack, err);
        }
      },
    );

    socket.on(
      C2S.kick,
      async (payload: { code?: string; playerId?: string; targetId?: string }, ack?: Ack) => {
        try {
          const code = normalizeCode(payload?.code ?? myCode ?? '');
          const room = getRoom(code);
          const kickerId = payload?.playerId ?? myId;
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
            await persistRoom(
              remaining.code,
              remaining.name,
              remaining.maxPlayers,
              remaining.hostId,
              remaining.status,
            );
            await persistGameContext(
              remaining.code,
              remaining.game.state,
              remaining.game.chanceDeck,
              remaining.game.chestDeck,
            );
            broadcast(remaining);
          }
          ack?.({ ok: true });
        } catch (err) {
          fail(socket, ack, err);
        }
      },
    );

    /* ---------------------- buildings & mortgages ---------------------- */

    const propertyAction = (
      event: string,
      apply: (room: Room, playerId: string, tile: number) => GameContext,
      type: string,
    ) => {
      socket.on(event, async (payload: { code?: string; playerId?: string; tile?: number }, ack?: Ack) => {
        try {
          const code = normalizeCode(payload?.code ?? myCode ?? '');
          const room = getRoom(code);
          const playerId = payload?.playerId ?? myId;
          if (!room || !playerId) throw new GameError('Room not found.');
          const tile = Math.floor(Number(payload?.tile));
          if (!Number.isFinite(tile) || tile < 0 || tile >= 40) {
            throw new GameError('Unknown tile.');
          }
          room.game = apply(room, playerId, tile);
          await afterAction(room, type, { playerId, tile });
          ack?.({ ok: true });
        } catch (err) {
          fail(socket, ack, err);
        }
      });
    };

    propertyAction(C2S.build, (room, playerId, tile) => buildOn(room.game, playerId, tile), 'build');
    propertyAction(
      C2S.sellBuilding,
      (room, playerId, tile) => sellBuilding(room.game, playerId, tile),
      'sell-building',
    );
    propertyAction(
      C2S.mortgage,
      (room, playerId, tile) => mortgageTile(room.game, playerId, tile),
      'mortgage',
    );
    propertyAction(
      C2S.unmortgage,
      (room, playerId, tile) => unmortgageTile(room.game, playerId, tile),
      'unmortgage',
    );

    /* -------------------------------- chat -------------------------------- */

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

    /* ----------------------------- voice chat ------------------------------ */

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
    ack?.({ ok: true, data: others });
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

  /* ----------------------------- disconnect ----------------------------- */

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
      await persistGameContext(
        room.code,
        room.game.state,
        room.game.chanceDeck,
        room.game.chestDeck,
      ).catch(() => undefined);
    });
  });
}

export function resetSocketMaps() {
  socketByPlayer.clear();
}
