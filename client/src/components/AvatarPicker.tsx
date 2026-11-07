import { AVATARS } from '@shared/avatars';

export default function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (avatarId: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {AVATARS.map((a) => {
        const active = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            title={a.label}
            aria-pressed={active}
            onClick={() => onChange(a.id)}
            className={`flex aspect-square items-center justify-center rounded-xl border text-xl transition ${
              active
                ? 'border-gold bg-gold/20 shadow-[0_0_0_3px_rgba(245,185,66,0.25)]'
                : 'border-slate-600/50 bg-black/30 hover:border-slate-400'
            }`}
          >
            {a.emoji}
          </button>
        );
      })}
    </div>
  );
}
