export default function Toast({
  text,
  kind,
  onDismiss,
}: {
  text: string;
  kind: 'error' | 'info';
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className={`animate-toast pointer-events-auto flex max-w-lg items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
          kind === 'error'
            ? 'border-rose-500/60 bg-rose-950/85 text-rose-100'
            : 'border-emerald-500/60 bg-emerald-950/85 text-emerald-100'
        }`}
        role="status"
      >
        <span>{kind === 'error' ? '⚠️' : '✅'}</span>
        <span className="flex-1">{text}</span>
        <button
          className="text-lg leading-none opacity-70 hover:opacity-100"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
