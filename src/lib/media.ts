/**
 * Photo helpers. A property's `photos` list mixes real images with the colour
 * hints (`#rrggbb`) the demo data uses as placeholders, so everything that
 * renders a photo goes through `isImageRef` / `mediaUrl` first.
 */

const API_ORIGIN = (() => {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
  try {
    return new URL(base).origin;
  } catch {
    return '';
  }
})();

/** True for something an <img> can show (an upload, a stored URL or a remote URL), false for colour hints. */
export function isImageRef(ref: string | undefined | null): ref is string {
  return !!ref && (ref.startsWith('/') || ref.startsWith('data:image/') || /^https?:\/\//.test(ref));
}

/** Resolve a stored photo reference to a loadable URL. Root-relative paths live on the API host. */
export function mediaUrl(ref: string): string {
  return ref.startsWith('/') ? `${API_ORIGIN}${ref}` : ref;
}

/** The real images in a photo list, as loadable URLs (colour hints dropped). */
export function imageUrls(photos: string[] | undefined | null): string[] {
  return (photos ?? []).filter(isImageRef).map(mediaUrl);
}

/** The first real image in a photo list, or undefined. */
export function coverImage(photos: string[] | undefined | null): string | undefined {
  return imageUrls(photos)[0];
}

/**
 * Read an image file, scale it down so its longest side is at most `maxDim`,
 * and return it as a JPEG data URL. Keeps uploads small (a phone photo is
 * several MB; this lands around 200–400 KB) without the user having to resize.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name} could not be read as an image.`);
  });

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not available in this browser.');

  // JPEG has no alpha — paint white first so transparent PNGs don't turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', quality);
}
