import { useRef } from 'react';
import { AVATARS } from '@shared/avatars';

/** The original pick set plus a wide second pack ("many emojis"). */
const EXTRA_EMOJIS = [
  '😎', '🤩', '🥳', '😏', '🤑', '🤔', '🫡', '😤', '🥱', '😴',
  '😈', '👿', '💀', '☠️', '🥷', '🤖', '👽', '🦊', '🐼', '🐯',
  '🦁', '🐵', '🐸', '🐙', '🦑', '🦩', '🦒', '🦓', '🐘', '🦏',
  '🦬', '🐃', '🐂', '🐄', '🐴', '🐏', '🐑', '🦌', '🫎', '🦙',
  '🐐', '🦝', '🦨', '🦡', '🐭', '🐀', '🐿️', '🦔', '🐈‍⬛', '🐕‍🦺',
  '🔥', '✨', '🌟', '💫', '⚡', '☄️', '🌙', '⭐', '🌈', '🎧',
  '🎮', '🎯', '🎳', '🎲', '🃏', '🀄', '🎰', '🎪', '🎭', '🎨',
];

const ALL_IDS = [
  ...AVATARS.map((a) => a.id),
  ...EXTRA_EMOJIS,
];

/** Downscale any image to a small JPEG data-URL (fits localStorage + socket payloads). */
export function fileToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

export default function AvatarPicker({
  value,
  image,
  onChange,
  onImageChange,
}: {
  value: string;
  image: string | null;
  onChange: (avatarId: string) => void;
  onImageChange: (src: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const currentEmoji = AVATARS.find((a) => a.id === value)?.emoji ?? '🎩';

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    fileToDataUrl(file)
      .then((url) => onImageChange(url))
      .catch(() => undefined);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/25 bg-amber-500 text-3xl shadow-lg">
          {image ? (
            <img src={image} alt="Your photo" className="h-full w-full object-cover" />
          ) : (
            currentEmoji
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Your picture</div>
          <p className="text-[11px] leading-snug text-slate-500">
            Upload any photo — teammates see it on every device. Stored on your profile.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="btn btn-ghost !px-3 !py-1.5 text-xs"
              onClick={() => fileRef.current?.click()}
            >
              📷 Upload photo
            </button>
            {image && (
              <button
                type="button"
                className="btn btn-ghost !px-3 !py-1.5 text-xs"
                onClick={() => onImageChange(null)}
              >
                ✖ Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload profile photo"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        {ALL_IDS.map((id) => {
          const emoji = AVATARS.find((a) => a.id === id)?.emoji ?? id;
          const active = !image && id === value;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              aria-label={id}
              title={id}
              onClick={() => {
                onImageChange(null);
                onChange(id);
              }}
              className={`flex min-h-11 min-w-11 aspect-square items-center justify-center rounded-xl border text-xl transition ${
                active
                  ? 'border-gold bg-gold/20 shadow-[0_0_0_3px_rgba(245,185,66,0.25)]'
                  : 'border-slate-600/50 bg-black/30 hover:border-slate-400'
              }`}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
