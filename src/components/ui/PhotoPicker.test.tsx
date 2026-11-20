import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoPicker } from './PhotoPicker';

vi.mock('@/lib/media', async (orig) => ({ ...(await orig<typeof import('@/lib/media')>()), compressImage: vi.fn() }));
import { compressImage } from '@/lib/media';

function Harness({ initial = [], max }: { initial?: string[]; max?: number }) {
  const [value, setValue] = useState(initial);
  return (<><PhotoPicker value={value} onChange={setValue} max={max} /><output data-testid="value">{JSON.stringify(value)}</output></>);
}
const value = () => JSON.parse(screen.getByTestId('value').textContent!) as string[];
const file = (name = 'a.jpg', type = 'image/jpeg') => new File(['x'], name, { type });
const input = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => vi.mocked(compressImage).mockReset());

describe('PhotoPicker', () => {
  it('marks the first photo as the cover and can promote another', async () => {
    render(<Harness initial={['https://x.test/1.jpg', 'https://x.test/2.jpg']} />);
    expect(screen.getByText('Cover')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Make cover' }));
    expect(value()).toEqual(['https://x.test/2.jpg', 'https://x.test/1.jpg']);
  });

  it('removes a photo', async () => {
    render(<Harness initial={['https://x.test/1.jpg', 'https://x.test/2.jpg']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(value()).toEqual(['https://x.test/2.jpg']);
  });

  it('compresses picked files and appends them', async () => {
    vi.mocked(compressImage).mockResolvedValueOnce('data:image/jpeg;base64,ONE').mockResolvedValueOnce('data:image/jpeg;base64,TWO');
    const { container } = render(<Harness initial={['https://x.test/1.jpg']} />);
    await userEvent.upload(input(container), [file('a.jpg'), file('b.jpg')]);
    await waitFor(() => expect(value()).toHaveLength(3));
    expect(value().slice(1)).toEqual(['data:image/jpeg;base64,ONE', 'data:image/jpeg;base64,TWO']);
  });

  it('hides the add tile once the limit is reached', () => {
    render(<Harness initial={['https://x.test/1.jpg', 'https://x.test/2.jpg']} max={2} />);
    expect(screen.queryByText('Add photo')).not.toBeInTheDocument();
  });

  it('only takes what fits and says so', async () => {
    vi.mocked(compressImage).mockResolvedValue('data:image/jpeg;base64,NEW');
    const { container } = render(<Harness initial={['https://x.test/1.jpg']} max={2} />);
    await userEvent.upload(input(container), [file('a.jpg'), file('b.jpg'), file('c.jpg')]);
    await waitFor(() => expect(value()).toHaveLength(2));
    expect(screen.getByText('You can add up to 2 photos.')).toBeInTheDocument();
    expect(compressImage).toHaveBeenCalledTimes(1);
  });

  it('shows why a file was rejected and keeps the ones that worked', async () => {
    vi.mocked(compressImage).mockRejectedValueOnce(new Error('notes.pdf is not an image.')).mockResolvedValueOnce('data:image/jpeg;base64,OK');
    const { container } = render(<Harness />);
    await userEvent.upload(input(container), [file('notes.pdf', 'image/png'), file('ok.jpg')], { applyAccept: false });
    expect(await screen.findByText('notes.pdf is not an image.')).toBeInTheDocument();
    expect(value()).toEqual(['data:image/jpeg;base64,OK']);
  });
});
