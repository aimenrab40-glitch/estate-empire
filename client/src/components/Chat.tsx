import { useEffect, useRef, useState } from 'react';
import { emojiFor } from '@shared/avatars';
import type { ChatMessage } from '@shared/types';

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Chat({ messages, onSend, disabled = false }: ChatProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div
        ref={ref}
        className="h-40 overflow-y-auto rounded-xl border border-slate-600/40 bg-black/30 p-2.5 text-xs"
      >
        {messages.length === 0 && <div className="text-slate-500">Say hi to the table</div>}
        {messages.map((m) => (
          <div key={m.id} className="mb-1.5 flex items-start gap-2">
            <span
              className="mt-[1px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
              style={{ background: m.color }}
            >
              {(m.name ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <span className="font-bold" style={{ color: m.color }}>
                {m.name}
              </span>{' '}
              <span className="text-slate-500">{formatTime(m.ts)}</span>
              <div className="break-words text-slate-200">{m.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1 !py-2 text-sm"
          placeholder={disabled ? 'Join the room to chat' : 'Message the table…'}
          value={text}
          maxLength={300}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="btn btn-ghost !px-3" disabled={disabled || !text.trim()} onClick={submit}>
          Send
        </button>
      </div>
    </div>
  );
}
