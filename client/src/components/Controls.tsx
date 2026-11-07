import { useEffect, useState } from 'react';
import { BOARD, isBuyable } from '@shared/board';
import { JAIL_FINE } from '@shared/board';
import { emojiFor } from '@shared/avatars';
import type { GameState, PublicPlayer } from '@shared/types';
import Dice from './Dice';

interface ControlsProps {
  state: GameState;
  me: PublicPlayer | null;
  isMyTurn: boolean;
  busy: boolean;
  rollKey: string;
  onRoll: () => void;
  onBuy: () => void;
  onPass: () => void;
  onEndTurn: () => void;
  onPayBail: () => void;
  onBid: (amount: number) => void;
  onLeave: () => void;
}

function useCountdown(endsAt: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [endsAt]);
  return left;
}

export default function Controls(props: ControlsProps) {
  const { state, me, isMyTurn, busy, rollKey, onRoll, onBuy, onPass, onEndTurn, onPayBail, onBid, onLeave } = props;
  const auction = state.auction;
  const secondsLeft = useCountdown(auction?.endsAt ?? null);
  const [bid, setBid] = useState('');

  useEffect(() => {
    if (!auction) setBid('');
  }, [auction?.tile, auction?.highestBid, auction === null]);

  const pending = state.pendingTile !== null ? BOARD[state.pendingTile] : null;
  const currentPlayer = state.players[state.turnIndex];
  const jailTurnsLeft = me ? Math.max(0, 3 - me.jailTurns) : 0;

  if (state.phase === 'ended') {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="text-4xl">🏆</div>
        <div className="text-xl font-black text-gold-2">
          {winner ? `${winner.name} wins!` : 'Game over'}
        </div>
        <p className="max-w-xs text-sm text-slate-300">
          Final standings: {state.players.map((p) => `${p.name} $${p.cash}`).join(' · ')}
        </p>
        <button className="btn btn-ghost" onClick={onLeave}>
          Leave table
        </button>
      </div>
    );
  }

  /* --------------------------------- auction -------------------------------- */
  if (state.awaiting === 'auction' && auction) {
    const tile = BOARD[auction.tile];
    const minBid = auction.highestBid > 0 ? auction.highestBid + 1 : 1;
    const highest = auction.highestBidderId
      ? state.players.find((p) => p.id === auction.highestBidderId)
      : null;
    const canAfford = me ? me.cash >= minBid : false;
    const suggested = String(minBid);

    return (
      <div className="flex w-full max-w-md flex-col items-center gap-2 text-center animate-card">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">🔨 Auction</div>
        <div className="text-lg font-black">{tile.name}</div>
        <div className="text-sm text-slate-300">
          {auction.highestBid > 0 ? (
            <>
              Highest bid <b className="text-gold-2">${auction.highestBid}</b> by{' '}
              <b style={{ color: highest?.color }}>{highest?.name ?? '—'}</b>
            </>
          ) : (
            <>No bids yet — start at $1</>
          )}
        </div>
        <div className="text-xs text-slate-400">closes in {secondsLeft}s</div>

        <div className="mt-1 flex w-full items-center gap-2">
          <input
            className="input flex-1 text-right"
            inputMode="numeric"
            value={bid}
            placeholder={suggested}
            onChange={(e) => setBid(e.target.value.replace(/[^0-9]/g, ''))}
            aria-label="Bid amount"
          />
          <button
            className="btn btn-primary"
            disabled={busy || !canAfford}
            onClick={() => {
              const value = Number(bid || suggested);
              if (value > 0) onBid(value);
            }}
          >
            Bid
          </button>
        </div>
        {!canAfford && (
          <div className="text-[11px] text-rose-300">
            {me ? `You only have $${me.cash}` : 'You are not at this table'}
          </div>
        )}
        <div className="text-[11px] text-slate-500">Highest bidder buys when the timer runs out.</div>
      </div>
    );
  }

  /* -------------------------------- normal play ------------------------------ */
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
      <Dice dice={state.dice} rollKey={rollKey} />

      <div className="text-sm font-semibold text-slate-200">{state.message}</div>

      {state.awaiting === 'buy' && pending && (
        <div className="flex w-full flex-col gap-2 animate-card">
          <div className="rounded-lg border border-gold/40 bg-black/30 p-2 text-sm">
            <b>{pending.name}</b>
            {isBuyable(pending) && (
              <>
                {' — price '}
                <b className="text-gold-2">${pending.price}</b>
                {pending.rent && (
                  <>
                    {' · base rent '}
                    <b>${pending.rent[0]}</b>
                  </>
                )}
              </>
            )}
            <div className="mt-1 text-[11px] text-slate-400">
              You have <b className="text-emerald-300">${me?.cash ?? 0}</b>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-green flex-1" disabled={busy || !isMyTurn} onClick={onBuy}>
              Buy ${pending.price}
            </button>
            <button className="btn btn-ghost flex-1" disabled={busy || !isMyTurn} onClick={onPass}>
              Decline
            </button>
          </div>
        </div>
      )}

      {state.awaiting === 'roll' && isMyTurn && me && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button className="btn btn-primary px-6 py-3 text-base" disabled={busy} onClick={onRoll}>
            🎲 Roll dice
          </button>
          {me.inJail && (
            <button
              className="btn btn-ghost"
              disabled={busy || (me.jailCards === 0 && me.cash < JAIL_FINE)}
              onClick={onPayBail}
              title={me.jailCards > 0 ? 'Use a Get Out of Jail Free card' : `Pay the $${JAIL_FINE} fine`}
            >
              {me.jailCards > 0 ? 'Use free card' : `Pay $${JAIL_FINE} bail`}
            </button>
          )}
          {me.inJail && (
            <div className="w-full text-[11px] text-slate-400">
              In jail — roll doubles to get out free ({jailTurnsLeft} attempt
              {jailTurnsLeft === 1 ? '' : 's'} left before the fine is taken automatically).
            </div>
          )}
        </div>
      )}

      {state.awaiting === 'end-turn' && isMyTurn && (
        <button className="btn btn-primary px-6 py-3 text-base" disabled={busy} onClick={onEndTurn}>
          End turn →
        </button>
      )}

      {!isMyTurn && state.awaiting !== 'buy' && (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          {currentPlayer && (
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs"
              style={{ background: currentPlayer.color }}
            >
              {emojiFor(currentPlayer.avatar)}
            </span>
          )}
          Waiting for <b>{currentPlayer?.name}</b>…
        </div>
      )}

      {state.awaiting === 'buy' && !isMyTurn && (
        <div className="text-sm text-slate-300">
          <b>{currentPlayer?.name}</b> is deciding whether to buy {pending?.name}…
        </div>
      )}
    </div>
  );
}
