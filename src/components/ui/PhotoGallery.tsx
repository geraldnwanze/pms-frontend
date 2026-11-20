'use client';

import { useState } from 'react';
import { imageUrls } from '@/lib/media';
import { classNames } from '@/lib/format';

/** A large hero image with a thumbnail row to switch between photos. Renders nothing when there are no real images. */
export function PhotoGallery({ photos, name, className }: { photos: string[] | undefined | null; name: string; className?: string }) {
  const images = imageUrls(photos);
  const [active, setActive] = useState(0);
  if (images.length === 0) return null;
  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-ink-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current} alt={name} className="h-56 w-full object-cover sm:h-72" />
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}`}
              className={classNames(
                'h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition-opacity',
                i === active ? 'ring-brand-500' : 'opacity-70 ring-transparent hover:opacity-100',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
