import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BOARD, GROUP_COLOR_HEX, isBuyable, tileGridPos, tileSide } from '@shared/board';
import { emojiFor } from '@shared/avatars';
import type { GameState, PublicPlayer, Tile } from '@shared/types';

/* --------------------------- token walk animation --------------------------- */

function useAnimatedPositions(players: PublicPlayer[]) {
  const targets = useMemo(() => players.map((p) => `${p.id}:${p.position}`).join('|'), [players]);
  const [display, setDisplay] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.position])),
  );
  const playersRef = useRef(players);
  const displayRef = useRef(display);
  playersRef.current = players;
  displayRef.current = display;

  useEffect(() => {
    const timers: number[] = [];
    const next: Record<string, number> = { ...displayRef.current };
    let changed = false;

    for (const p of playersRef.current) {
      const cur = next[p.id];
      if (cur === undefined) {
        next[p.id] = p.position;
        changed = true;
        continue;
      }
      if (cur === p.position) continue;
      const steps = (p.position - cur + 40) % 40;
      if (steps === 0) continue;

      // Short forward moves walk tile-by-tile; teleports (jail, back-3 cards)
      // jump straight to the destination so the token doesn't orbit the board.
      if (steps > 12 || p.inJail && p.position === 10) {
        next[p.id] = p.position;
        changed = true;
        continue;
      }
      for (let s = 1; s <= steps; s++) {
        timers.push(
          window.setTimeout(() => {
            setDisplay((prev) => ({ ...prev, [p.id]: ((next[p.id] ?? cur) + s) % 40 }));
          }, s * 135),
        );
      }
    }

    if (changed) setDisplay(next);
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets]);

  return display;
}

/* --------------------------------- tile view -------------------------------- */

interface TileViewProps {
  tile: Tile;
  state: GameState;
  meId: string | null;
  speaking?: Set<string>;
  atPosition: PublicPlayer[];
}

function tileKindLabel(tile: Tile): string {
  switch (tile.kind) {
    case 'chance':
      return '?';
    case 'chest':
      return '★';
    case 'tax':
      return '$';
    case 'go':
      return 'GO';
    case 'jail':
      return 'JAIL';
    case 'parking':
      return 'P';
    case 'gotojail':
      return '→';
    case 'railroad':
      return '🚂';
    case 'utility':
      return tile.name === 'Power Plant' ? '⚡' : '💧';
    default:
      return '';
  }
}

function tileSideClass(index: number): string {
  switch (tileSide(index)) {
    case 'top':
      return 'side-top';
    case 'right':
      return 'side-right';
    case 'bottom':
      return 'side-bottom';
    case 'left':
      return 'side-left';
  }
}

function TileView({ tile, state, meId, speaking, atPosition }: TileViewProps) {
  const { row, col } = tileGridPos(tile.index);
  const ownerId = state.ownerId[tile.index];
  const owner = ownerId ? state.players.find((p) => p.id === ownerId) : null;
  const isCorner = tile.index % 10 === 0;
  const isPending = state.awaiting === 'buy' && state.pendingTile === tile.index;
  const isMine = ownerId !== null && ownerId === meId;
  const band = tile.group ? GROUP_COLOR_HEX[tile.group] : null;
  const special = !isBuyable(tile) && tile.kind !== 'tax';
  const side = tileSideClass(tile.index);
  const level = state.buildings?.[tile.index] ?? 0;
  const isMortgaged = !!state.mortgaged?.[tile.index];

  const classes = [
    'tile',
    isCorner ? 'tile-corner' : '',
    `index-${tile.index}`,
    side,
    isPending ? 'tile-pending' : '',
    isMine ? 'tile-mine' : '',
    isMortgaged ? 'tile-mortgaged' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{ gridRow: row, gridColumn: col }}
      title={`${tile.name}${tile.price ? ` — $${tile.price}` : ''}${owner ? ` (owned by ${owner.name})` : ''}${isMortgaged ? ' · MORTGAGED' : ''}${level > 0 ? (level >= 5 ? ' · hotel' : ` · ${level} house(s)`) : ''}`}
    >
      {band && <div className="tile-band" style={{ background: band }} />}
      {!band && !isCorner && <div className="tile-band" style={{ background: '#e2e8f3' }} />}

      {/* Icon strip — every property/railroad/utility/tax tile gets its own icon */}
      <div className="tile-icon">{tile.icon ?? tileKindLabel(tile)}</div>

      <div className="tile-name">
        {special && (
          <span className="mr-[3%] text-[1.4cqw] not-italic">{tileKindLabel(tile)}</span>
        )}
        <span className="break-words">{tile.name}</span>
      </div>

      {tile.price !== undefined && <div className="tile-price">${tile.price}</div>}
      {tile.amount !== undefined && <div className="tile-price">${tile.amount}</div>}

      {owner && (
        <div
          className="owner-dot"
          style={{ background: owner.color }}
          aria-label={`Owned by ${owner.name}`}
        />
      )}

      {level > 0 && (
        <div className="build-pips" aria-label={level >= 5 ? 'Hotel' : `${level} house(s)`}>
          {level >= 5 ? '🏨' : '🏠'.repeat(level)}
        </div>
      )}
      {isMortgaged && (
        <div className="mortgage-chip" title="Mortgaged — rent suspended">
          M
        </div>
      )}

      {atPosition.length > 0 && (
        <div className="absolute inset-x-0 bottom-[4%] flex flex-wrap items-center justify-center gap-[4%] px-[4%]">
          {atPosition.map((p) => (
            <div
              key={p.id}
              className={`token ${p.id === state.players[state.turnIndex]?.id ? 'token-turn' : ''} ${
                speaking?.has(p.id) ? 'token-speaking' : ''
              }`}
              style={{
                background: p.color,
                opacity: p.connected ? 1 : 0.45,
                position: 'relative',
                left: 'auto',
                top: 'auto',
              }}
              title={p.name}
            >
              <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.5))' }}>{emojiFor(p.avatar)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- board ---------------------------------- */

interface BoardProps {
  state: GameState;
  meId: string | null;
  speaking?: Set<string>;
  children?: ReactNode;
}

export default function Board({ state, meId, speaking, children }: BoardProps) {
  const players = state.players.filter((p) => !p.bankrupt);
  const display = useAnimatedPositions(players);

  const byTile = useMemo(() => {
    const map = new Map<number, PublicPlayer[]>();
    for (const p of players) {
      const at = display[p.id] ?? p.position;
      const list = map.get(at) ?? [];
      list.push(p);
      map.set(at, list);
    }
    return map;
  }, [players, display]);

  return (
    <div className="board">
      {BOARD.map((tile) => (
        <TileView
          key={tile.index}
          tile={tile}
          state={state}
          meId={meId}
          speaking={speaking}
          atPosition={byTile.get(tile.index) ?? []}
        />
      ))}
      <div
        className="tile-center"
        style={{ gridRow: '2 / span 9', gridColumn: '2 / span 9' }}
      >
        {children}
      </div>
    </div>
  );
}
