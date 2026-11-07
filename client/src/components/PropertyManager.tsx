import { useMemo } from 'react';
import { BOARD, GROUP_COLOR_HEX, GROUP_LABEL, GROUP_TILES, mortgageValue, unmortgageCost } from '@shared/board';
import type { GameState, PublicPlayer } from '@shared/types';

interface PropertyManagerProps {
  state: GameState;
  me: PublicPlayer | null;
  meId: string | null;
  busy: boolean;
  onBuild: (tile: number) => void;
  onSellBuilding: (tile: number) => void;
  onMortgage: (tile: number) => void;
  onUnmortgage: (tile: number) => void;
}

const MAX_LEVEL = 5;

interface BuildCheck {
  ok: boolean;
  reason: string;
}

/** Client-side hint mirroring the server rules (the server is authoritative). */
function buildCheck(state: GameState, meId: string, tileIndex: number): BuildCheck {
  const tile = BOARD[tileIndex];
  if (tile.kind !== 'property' || !tile.group) return { ok: false, reason: 'Only colour streets build.' };
  const group = tile.group;
  const indices = (GROUP_TILES[group] ?? []).filter((i) => BOARD[i].kind === 'property');
  const owner = state.ownerId[tileIndex];
  if (owner !== meId) return { ok: false, reason: 'You do not own this street.' };
  if (indices.some((i) => state.mortgaged?.[i])) {
    return { ok: false, reason: 'Unmortgage the whole set first.' };
  }
  if (!indices.every((i) => state.ownerId[i] === meId)) {
    return { ok: false, reason: 'Own the whole colour set first.' };
  }
  const level = state.buildings?.[tileIndex] ?? 0;
  if (level >= MAX_LEVEL) return { ok: false, reason: 'Hotel is the maximum.' };
  const min = Math.min(...indices.map((i) => state.buildings?.[i] ?? 0));
  if (level > min) return { ok: false, reason: 'Build evenly across the set first.' };
  const cost = tile.houseCost ?? 0;
  const me = state.players.find((p) => p.id === meId);
  if ((me?.cash ?? 0) < cost) return { ok: false, reason: `Need $${cost}.` };
  return { ok: true, reason: 'Build' };
}

function sellCheck(state: GameState, meId: string, tileIndex: number): boolean {
  const tile = BOARD[tileIndex];
  if (!tile.group) return false;
  const indices = (GROUP_TILES[tile.group] ?? []).filter((i) => BOARD[i].kind === 'property');
  const level = state.buildings?.[tileIndex] ?? 0;
  if (state.ownerId[tileIndex] !== meId || level <= 0) return false;
  const max = Math.max(...indices.map((i) => state.buildings?.[i] ?? 0));
  return level === max;
}

export default function PropertyManager(props: PropertyManagerProps) {
  const { state, me, meId, busy, onBuild, onSellBuilding, onMortgage, onUnmortgage } = props;

  const groups = useMemo(() => {
    if (!meId) return [];
    const mine = (me?.properties ?? [])
      .slice()
      .sort((a, b) => {
        const ga = BOARD[a].group ?? '';
        const gb = BOARD[b].group ?? '';
        return ga === gb ? a - b : ga.localeCompare(gb);
      });
    const byGroup = new Map<string, number[]>();
    for (const i of mine) {
      const g = BOARD[i].group ?? 'other';
      const arr = byGroup.get(g) ?? [];
      arr.push(i);
      byGroup.set(g, arr);
    }
    return [...byGroup.entries()];
  }, [me?.properties, meId]);

  if (!meId || !me || groups.length === 0) return null;

  const invested = (me.properties ?? []).reduce(
    (sum, i) => sum + (state.buildings?.[i] ?? 0) * Math.floor((BOARD[i].houseCost ?? 0)),
    0,
  );

  return (
    <section className="panel flex max-h-72 flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">
          My properties ({me.properties.length})
        </h3>
        {invested > 0 && (
          <span className="text-[10px] text-slate-500">
            buildings <b className="text-slate-300">${invested}</b>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {groups.map(([group, tiles]) => (
          <div key={group}>
            <div className="mb-1 flex items-center gap-2">
              <span
                className="h-2.5 w-4 rounded-sm"
                style={{ background: GROUP_COLOR_HEX[group] ?? '#64748b' }}
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {GROUP_LABEL[group] ?? group}
              </span>
            </div>
            <ul className="space-y-1">
              {tiles.map((i) => {
                const tile = BOARD[i];
                const level = state.buildings?.[i] ?? 0;
                const mortgaged = !!state.mortgaged?.[i];
                const houseCost = tile.houseCost ?? 0;
                const build = buildCheck(state, meId, i);
                const canSell = sellCheck(state, meId, i);
                const isProperty = tile.kind === 'property';
                const anyBuildingsInSet = isProperty
                  ? (GROUP_TILES[tile.group!] ?? []).some(
                      (t) => BOARD[t].kind === 'property' && (state.buildings?.[t] ?? 0) > 0,
                    )
                  : false;

                return (
                  <li
                    key={i}
                    className={`rounded-lg border px-2 py-1.5 ${
                      mortgaged
                        ? 'border-amber-700/40 bg-amber-950/20'
                        : 'border-slate-700/50 bg-black/25'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-200" title={tile.name}>
                        {tile.name}
                      </span>

                      {level > 0 &&
                        (level >= MAX_LEVEL ? (
                          <span className="rounded bg-rose-900/50 px-1.5 text-[10px] font-black text-rose-200" title="Hotel">
                            🏨
                          </span>
                        ) : (
                          <span className="text-[10px] font-black tracking-tight text-emerald-300" title={`${level} house(s)`}>
                            🏠{level}
                          </span>
                        ))}
                      {mortgaged && (
                        <span className="rounded bg-amber-800/50 px-1.5 text-[10px] font-black text-amber-200" title="Mortgaged — collects no rent">
                          M
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {isProperty && (
                        <button
                          className="prop-btn"
                          disabled={busy || !build.ok}
                          title={build.ok ? `Build for $${houseCost}` : build.reason}
                          onClick={() => onBuild(i)}
                        >
                          {level + 1 === MAX_LEVEL ? '🏨' : '🏠'} +${houseCost}
                        </button>
                      )}
                      {isProperty && level > 0 && (
                        <button
                          className="prop-btn"
                          disabled={busy || !canSell}
                          title={canSell ? `Sell back for $${Math.floor(houseCost / 2)}` : 'Sell from the most-built streets first'}
                          onClick={() => onSellBuilding(i)}
                        >
                          ▼ +${Math.floor(houseCost / 2)}
                        </button>
                      )}
                      {mortgaged ? (
                        <button
                          className="prop-btn prop-btn-gold"
                          disabled={busy || me.cash < unmortgageCost(tile)}
                          title={`Lift mortgage for $${unmortgageCost(tile)} (incl. 10% interest)`}
                          onClick={() => onUnmortgage(i)}
                        >
                          🔓 ${unmortgageCost(tile)}
                        </button>
                      ) : (
                        <button
                          className="prop-btn"
                          disabled={busy || anyBuildingsInSet}
                          title={
                            anyBuildingsInSet
                              ? 'Sell all buildings in the set first'
                              : `Mortgage for $${mortgageValue(tile)}`
                          }
                          onClick={() => onMortgage(i)}
                        >
                          💰 ${mortgageValue(tile)}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
