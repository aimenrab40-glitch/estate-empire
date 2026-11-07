import { BOARD, GROUP_TILES, mortgageValue } from '@shared/board';
import { emojiFor } from '@shared/avatars';
import type { GameState, PublicPlayer } from '@shared/types';

interface StatsOverlayProps {
  state: GameState;
  meId: string | null;
  onLeave: () => void;
}

const COLOUR_GROUPS = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'];

function netWorth(state: GameState, p: PublicPlayer): number {
  let worth = p.cash;
  for (const i of p.properties) {
    const tile = BOARD[i];
    if (!state.mortgaged?.[i]) worth += mortgageValue(tile);
    worth += (state.buildings?.[i] ?? 0) * (tile.houseCost ?? 0);
  }
  return worth;
}

function completeSets(state: GameState, p: PublicPlayer): number {
  let sets = 0;
  for (const group of COLOUR_GROUPS) {
    const tiles = (GROUP_TILES[group] ?? []).filter((i) => BOARD[i].kind === 'property');
    if (tiles.length > 0 && tiles.every((i) => state.ownerId[i] === p.id)) sets += 1;
  }
  return sets;
}

function fmtDuration(from: number | null): string {
  if (!from) return '';
  const mins = Math.max(1, Math.round((Date.now() - from) / 60_000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function StatsOverlay({ state, meId, onLeave }: StatsOverlayProps) {
  const winner = state.players.find((p) => p.id === state.winnerId) ?? null;
  const standings = [...state.players].sort((a, b) => netWorth(state, b) - netWorth(state, a));
  const maxRent = Math.max(1, ...state.players.map((p) => state.stats?.[p.id]?.rentCollected ?? 0));

  return (
    <div className="animate-fade fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]">
      <div className="panel max-h-[92vh] w-full max-w-3xl overflow-auto p-5 sm:p-6">
        {/* ---------------------------------------------------------- winner */}
        <div className="text-center">
          <div className="text-5xl">🏆</div>
          <h2 className="mt-1 text-2xl font-black text-gold-2">
            {winner ? `${winner.name} wins!` : 'Game over'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {state.round} round{state.round === 1 ? '' : 's'}
            {state.startedAt ? ` · ${fmtDuration(state.startedAt)}` : ''} ·{' '}
            {state.players.length} players · result saved to the match history ✓
          </p>
        </div>

        {/* ------------------------------------------------------- standings */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">Player</th>
                <th className="px-2 py-1 text-right">Cash</th>
                <th className="px-2 py-1 text-right">Net worth</th>
                <th className="px-2 py-1 text-right">Tiles</th>
                <th className="px-2 py-1 text-right">Sets</th>
                <th className="px-2 py-1">Rent collected</th>
                <th className="px-2 py-1 text-right">Taxes</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((p, i) => {
                const st = state.stats?.[p.id];
                const rentIn = st?.rentCollected ?? 0;
                const taxes = st?.taxesPaid ?? 0;
                const isWinner = p.id === state.winnerId;
                return (
                  <tr
                    key={p.id}
                    className={`${isWinner ? 'bg-gold/10' : 'bg-white/[0.03]'} ${
                      p.bankrupt ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="rounded-l-lg px-2 py-1.5 font-black text-slate-400">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="mr-1.5">{emojiFor(p.avatar)}</span>
                      <b className={isWinner ? 'text-gold-2' : 'text-slate-100'}>{p.name}</b>
                      {p.id === meId && <span className="ml-1 text-[10px] text-slate-500">(you)</span>}
                      {p.bankrupt && (
                        <span className="ml-1 rounded bg-rose-950/60 px-1.5 text-[9px] font-bold uppercase text-rose-300">
                          bankrupt
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">${p.cash}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold">
                      ${netWorth(state, p)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{p.properties.length}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{completeSets(state, p)}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-500/80"
                            style={{ width: `${Math.round((rentIn / maxRent) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-emerald-300">${rentIn}</span>
                      </div>
                    </td>
                    <td className="rounded-r-lg px-2 py-1.5 text-right font-mono text-rose-300">
                      ${taxes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-center text-[10px] text-slate-500">
          Net worth = cash + unmortgaged property (half price) + buildings at full cost.
        </p>

        <div className="mt-4 flex justify-center">
          <button className="btn btn-primary px-8 py-3 text-base" onClick={onLeave}>
            Leave table
          </button>
        </div>
      </div>
    </div>
  );
}
