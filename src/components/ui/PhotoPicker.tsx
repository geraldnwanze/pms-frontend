'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { compressImage, mediaUrl } from '@/lib/media';
import { classNames } from '@/lib/format';

/**
 * Multi-image picker. `value` holds image references — already-stored paths
 * (`/storage/...`) and freshly picked images (compressed JPEG data URLs); the
 * first one is the cover. Picked files are scaled down in the browser before
 * they ever leave it.
 */
export function PhotoPicker({
  value,
  onChange,
  max = 6,
  hint = 'JPG, PNG or WebP · the first photo is the cover',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const room = max - value.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(`You can add up to ${max} photos.`);

    setBusy(true);
    const added: string[] = [];
    for (const file of picked) {
      try {
        added.push(await compressImage(file));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That file could not be added.');
      }
    }
    setBusy(false);
    if (added.length) onChange([...value, ...added]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const makeCover = (i: number) => onChange([value[i], ...value.filter((_, idx) => idx !== i)]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((ref, i) => (
          <div key={ref.slice(-48) + i} className="group relative aspect-square overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(ref)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 ? (
              <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>
            ) : (
              <button
                type="button"
                onClick={() => makeCover(i)}
                className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                Make cover
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={classNames(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-300 text-ink-400 transition-colors hover:border-brand-400 hover:bg-ink-50 hover:text-brand-600',
              busy && 'cursor-wait opacity-60',
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-xs font-semibold">{busy ? 'Processing…' : 'Add photo'}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {error ? <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p> : <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
