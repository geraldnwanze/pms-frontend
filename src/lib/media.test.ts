import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImage, coverImage, imageUrls, isImageRef, mediaUrl } from './media';

describe('photo references', () => {
  it('accepts uploads, data URLs and remote URLs; rejects colour hints and blanks', () => {
    expect(isImageRef('/storage/properties/a.jpg')).toBe(true);
    expect(isImageRef('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageRef('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isImageRef('#1e293b')).toBe(false);
    expect(isImageRef('')).toBe(false);
    expect(isImageRef(null)).toBe(false);
    expect(isImageRef(undefined)).toBe(false);
  });

  it('mediaUrl puts root-relative paths on the API host and leaves the rest alone', () => {
    expect(mediaUrl('/storage/a.jpg')).toMatch(/^https?:\/\/[^/]+\/storage\/a\.jpg$/);
    expect(mediaUrl('/storage/a.jpg')).not.toContain('/api/v1');
    expect(mediaUrl('https://x.test/a.jpg')).toBe('https://x.test/a.jpg');
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('imageUrls drops colour hints, and coverImage is the first real image', () => {
    const photos = ['#aabbcc', 'https://x.test/1.jpg', '#112233', 'https://x.test/2.jpg'];
    expect(imageUrls(photos)).toEqual(['https://x.test/1.jpg', 'https://x.test/2.jpg']);
    expect(coverImage(photos)).toBe('https://x.test/1.jpg');
    expect(coverImage(['#aabbcc'])).toBeUndefined();
    expect(coverImage(undefined)).toBeUndefined();
    expect(imageUrls(null)).toEqual([]);
  });
});

describe('compressImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubCanvas(width: number, height: number) {
    const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx), toDataURL: vi.fn(() => 'data:image/jpeg;base64,OUT') };
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })));
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => (tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : real(tag)));
    return { canvas, ctx, close };
  }

  it('scales the longest side down to maxDim, keeping the aspect ratio', async () => {
    const { canvas, ctx, close } = stubCanvas(4000, 3000);
    const out = await compressImage(new File(['x'], 'big.jpg', { type: 'image/jpeg' }));
    expect(out).toBe('data:image/jpeg;base64,OUT');
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(close).toHaveBeenCalled();
  });

  it('never upscales small images, and paints white under transparency', async () => {
    const { canvas, ctx } = stubCanvas(400, 300);
    await compressImage(new File(['x'], 'small.png', { type: 'image/png' }));
    expect([canvas.width, canvas.height]).toEqual([400, 300]);
    expect(ctx.fillStyle).toBe('#ffffff');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 400, 300);
  });

  it('rejects non-images before touching the decoder', async () => {
    const decoder = vi.fn();
    vi.stubGlobal('createImageBitmap', decoder);
    await expect(compressImage(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).rejects.toThrow(/not an image/);
    expect(decoder).not.toHaveBeenCalled();
  });

  it('reports files the browser cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad'); }));
    await expect(compressImage(new File(['x'], 'broken.jpg', { type: 'image/jpeg' }))).rejects.toThrow(/could not be read/);
  });
});
