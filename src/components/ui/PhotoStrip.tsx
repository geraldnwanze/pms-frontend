'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { imageUrls } from '@/lib/media';
import { classNames } from '@/lib/format';

/**
 * A row of small thumbnails for a photo list (colour-hint placeholders are
 * ignored). Clicking one opens a full-size viewer with prev/next and Esc to
 * close. Safe to drop inside a clickable card — clicks don't bubble out.
 */
export function PhotoStrip({
  photos, max = 4, label = 'Photo', className,
}: {
  photos: string[] | undefined | null;
  max?: number;
  label?: string;
  className?: string;
}) {
  const urls = imageUrls(photos);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % urls.length));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + urls.length) % urls.length));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, urls.length]);

  if (urls.length === 0) return null;

  const shown = urls.slice(0, max);
  const extra = urls.length - shown.length;

  return (
    <div className={classNames('flex gap-1.5', className)} onClick={(e) => e.stopPropagation()}>
      {shown.map((src, i) => (
        <button
          key={src + i}
          type="button"
          onClick={() => setOpen(i)}
          aria-label={`${label} ${i + 1} of ${urls.length}`}
          className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200 transition-transform hover:scale-[1.03]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-cover" />
          {i === shown.length - 1 && extra > 0 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">+{extra}</span>
          )}
        </button>
      ))}

      {open !== null && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          {urls.length > 1 && (
            <>
              <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + urls.length) % urls.length); }} className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % urls.length); }} className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[open]} alt={`${label} ${open + 1}`} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain" />
          <p className="absolute bottom-4 text-xs font-medium text-white/80">{open + 1} / {urls.length}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
