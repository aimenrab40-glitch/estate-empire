import { useEffect, useState } from 'react';

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function Die({ value, seed }: { value: number; seed: string }) {
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), 520);
    return () => window.clearTimeout(t);
  }, [seed, value]);

  const pips = new Set(PIPS[value] ?? []);

  return (
    <div className={`die ${rolling ? 'rolling' : ''}`} role="img" aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center justify-center">
          {pips.has(i + 1) && <div className={`pip ${value === 1 ? 'pip-red' : ''}`} />}
        </div>
      ))}
    </div>
  );
}

export default function Dice({ dice, rollKey }: { dice: [number, number] | null; rollKey: string }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Die value={dice?.[0] ?? 1} seed={rollKey} />
      <Die value={dice?.[1] ?? 1} seed={rollKey} />
      <div className="ml-1 text-right">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">total</div>
        <div className="text-2xl font-black text-gold-2">
          {dice ? dice[0] + dice[1] : '—'}
        </div>
      </div>
    </div>
  );
}
