import { useEffect, useRef } from 'react';
import type { LogEntry } from '@shared/types';

export default function LogFeed({ log, className = '' }: { log: LogEntry[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  return (
    <div
      ref={ref}
      className={`overflow-y-auto rounded-xl border border-slate-600/40 bg-black/30 p-2.5 text-[12px] leading-relaxed ${className}`}
    >
      {log.length === 0 && <div className="text-slate-500">The match log will appear here…</div>}
      {log
        .slice()
        .reverse()
        .map((entry) => (
          <div key={entry.id} className={`log-${entry.kind} py-[1px]`}>
            {entry.text}
          </div>
        ))}
    </div>
  );
}
