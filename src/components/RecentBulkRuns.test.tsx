import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentBulkRuns } from './RecentBulkRuns';
import { renderWithStore } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { billRuns: vi.fn() } }));
import { api } from '@/lib/api';
import { today } from '@/lib/format';

const run = (over: object = {}) => ({
  id: 'r1', propertyId: 'p1', propertyName: 'Palm Grove', userId: 'u1', userName: 'Fatima Adeyemi', invoices: 24, total: 620_844, unitsSkipped: 4,
  createdAt: `${today()}T09:30:00+00:00`, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('RecentBulkRuns', () => {
  it('lists who billed what, where and when', async () => {
    vi.mocked(api.billRuns).mockResolvedValue([run()] as never);

    renderWithStore(<RecentBulkRuns propertyIds={['p1']} />);

    const card = await screen.findByTestId('recent-bulk-runs');
    expect(card).toHaveTextContent('Palm Grove · 24 invoices · 4 units skipped');
    expect(card).toHaveTextContent('Fatima Adeyemi · Today');
    expect(card).toHaveTextContent('620,844');
  });

  it('uses the singular for one invoice or one skipped unit, and says nothing about skips when there were none', async () => {
    vi.mocked(api.billRuns).mockResolvedValue([run({ invoices: 1, unitsSkipped: 1 }), run({ id: 'r2', invoices: 3, unitsSkipped: 0 })] as never);

    renderWithStore(<RecentBulkRuns propertyIds={['p1']} />);

    const card = await screen.findByTestId('recent-bulk-runs');
    expect(card).toHaveTextContent('1 invoice · 1 unit skipped');
    expect(card).toHaveTextContent('3 invoices');
    expect(card.textContent).not.toMatch(/3 invoices · 0/);
  });

  it('shows only the runs on the properties being looked at, and at most five', async () => {
    vi.mocked(api.billRuns).mockResolvedValue([
      run({ id: 'a', propertyId: 'p2', propertyName: 'Elsewhere' }),
      ...Array.from({ length: 7 }, (_, i) => run({ id: `r${i}`, propertyName: `Palm Grove ${i}` })),
    ] as never);

    renderWithStore(<RecentBulkRuns propertyIds={['p1']} />);

    const card = await screen.findByTestId('recent-bulk-runs');
    expect(card).not.toHaveTextContent('Elsewhere');
    expect(card.querySelectorAll('li')).toHaveLength(5);
  });

  it('shows nothing when there has been no run, or when the list cannot be loaded', async () => {
    vi.mocked(api.billRuns).mockResolvedValueOnce([] as never);
    const { unmount } = renderWithStore(<RecentBulkRuns propertyIds={['p1']} />);
    await waitFor(() => expect(api.billRuns).toHaveBeenCalled());
    expect(screen.queryByTestId('recent-bulk-runs')).toBeNull();
    unmount();

    vi.mocked(api.billRuns).mockRejectedValueOnce(new Error('403'));
    renderWithStore(<RecentBulkRuns propertyIds={['p1']} />);
    await waitFor(() => expect(api.billRuns).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('recent-bulk-runs')).toBeNull();
  });

  it('asks again when told to refresh', async () => {
    vi.mocked(api.billRuns).mockResolvedValue([] as never);

    const { rerender, store } = renderWithStore(<RecentBulkRuns propertyIds={['p1']} refreshKey={0} />);
    await waitFor(() => expect(api.billRuns).toHaveBeenCalledTimes(1));
    void store;
    rerender(<RecentBulkRuns propertyIds={['p1']} refreshKey={1} />);

    await waitFor(() => expect(api.billRuns).toHaveBeenCalledTimes(2));
  });
});
