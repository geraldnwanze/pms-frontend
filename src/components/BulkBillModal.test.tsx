import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkBillModal } from './BulkBillModal';
import { makeTestStore, renderWithStore } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { billAllMeters: vi.fn() } }));
vi.mock('@/store/thunks', () => ({ bootstrap: vi.fn(() => ({ type: 'test/bootstrap' })) }));
import { api, ApiError } from '@/lib/api';
import { bootstrap } from '@/store/thunks';

const unit = (over: object = {}) => ({
  unitId: 'u1', unitCode: 'B07', propertyId: 'p1', propertyName: 'Palm Grove', final: false, tenantId: 't1', tenantName: 'Ada Obi', leaseCode: 'LSE-1', invoiceId: null, invoiceCode: null, total: 11_100,
  meters: [
    { meterId: 'm1', meterNumber: 'MTR-1', type: 'electricity', unitOfMeasure: 'kWh', from: 100, to: 250, units: 150, rate: 60, amount: 9_000 },
    { meterId: 'm2', meterNumber: 'WTR-2', type: 'water', unitOfMeasure: 'm³', from: 10, to: 20.5, units: 10.5, rate: 200, amount: 2_100 },
  ],
  ...over,
});
const result = (over: object = {}) => ({ dryRun: true, invoices: 0, meters: 2, total: 11_100, units: [unit()], skipped: [], ...over });

function open() {
  const onClose = vi.fn();
  const onBilled = vi.fn();
  const store = makeTestStore();
  renderWithStore(<BulkBillModal propertyIds={['p1']} onClose={onClose} onBilled={onBilled} />, store);
  return { onClose, onBilled, store };
}
const toasts = (store: ReturnType<typeof makeTestStore>) => store.getState().ui.toasts.map((t) => `${t.kind}:${t.message}`);

beforeEach(() => vi.clearAllMocks());

describe('BulkBillModal', () => {
  it('asks the server what is ready without billing anything, and lists who would be billed for what', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValue(result() as never);

    open();

    expect(screen.getByText(/Checking what is ready/)).toBeInTheDocument();
    expect(await screen.findByTestId('bulk-summary')).toHaveTextContent('1 invoice · 2 meters');
    expect(api.billAllMeters).toHaveBeenCalledWith({ propertyIds: ['p1'], dryRun: true });
    expect(api.billAllMeters).toHaveBeenCalledTimes(1);
    const row = screen.getByTestId('bulk-unit');
    expect(row).toHaveTextContent('Unit B07 · Palm Grove');
    expect(row).toHaveTextContent('Ada Obi · LSE-1');
    expect(row).toHaveTextContent('MTR-1 · 100 → 250 kWh · 150 × ₦60');
    expect(row).toHaveTextContent('WTR-2 · 10 → 20.5 m³ · 10.5 × ₦200');
    expect(screen.getByRole('button', { name: /Bill 1 invoice · ₦11,100/ })).toBeInTheDocument();
  });

  it('marks a unit whose tenant has moved out as their final bill, and only that one', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValue(result({ units: [unit(), unit({ unitId: 'u2', unitCode: 'B08', tenantName: 'Bee Okoro', final: true })] }) as never);

    open();

    const rows = await screen.findAllByTestId('bulk-unit');
    expect(rows[0]).not.toHaveTextContent('Final bill');
    expect(rows[1]).toHaveTextContent('Bee Okoro');
    expect(rows[1]).toHaveTextContent('Final bill · moved out');
    expect(screen.getAllByTestId('final-chip')).toHaveLength(1);
  });

  it('bills for real only when confirmed, then refreshes and closes', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValueOnce(result() as never).mockResolvedValueOnce(result({ dryRun: false, invoices: 1 }) as never);
    const { onClose, onBilled, store } = open();

    fireEvent.click(await screen.findByRole('button', { name: /Bill 1 invoice/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onBilled).toHaveBeenCalledTimes(1);                                   // so the recent-runs list can refresh
    expect(api.billAllMeters).toHaveBeenLastCalledWith({ propertyIds: ['p1'] });
    expect(bootstrap).toHaveBeenCalled();
    expect(toasts(store)).toEqual(['success:1 utility invoice issued, ₦11,100 in all.']);
  });

  it('bills nothing if cancelled', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValue(result() as never);
    const { onClose } = open();

    await screen.findByTestId('bulk-summary');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(api.billAllMeters).toHaveBeenCalledTimes(1);                          // only the look, never the bill
  });

  it('says plainly when nothing is ready, with no bill button', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValue(result({ units: [], meters: 0, total: 0 }) as never);

    open();

    expect(await screen.findByTestId('bulk-empty')).toHaveTextContent('every meter has been billed up to its latest reading');
    expect(screen.queryByRole('button', { name: /^Bill / })).toBeNull();
  });

  it('does not claim everything is billed when units were skipped', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValue(result({ units: [], meters: 0, total: 0, skipped: [{ unitId: 'u9', unitCode: 'A09', propertyId: 'p2', propertyName: 'Cedar', reason: 'No tenant at the moment, so there is nobody to bill.' }] }) as never);

    open();

    expect(await screen.findByTestId('bulk-empty')).toHaveTextContent('Nothing can be billed right now');
    expect(screen.getByTestId('bulk-skipped')).toBeInTheDocument();
  });

  it('lists what could not be billed and why, next to what can be', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValue(result({ skipped: [{ unitId: 'u9', unitCode: 'A09', propertyId: 'p2', propertyName: 'Cedar Residences', reason: 'No tenant at the moment, so there is nobody to bill.' }] }) as never);

    open();

    expect(await screen.findByTestId('bulk-skipped')).toHaveTextContent('Unit A09 (Cedar Residences): No tenant at the moment');
    expect(screen.getByRole('button', { name: /Bill 1 invoice/ })).toBeInTheDocument();
  });

  it('shows the server’s reason when it cannot look, and offers no bill button', async () => {
    vi.mocked(api.billAllMeters).mockRejectedValue(new ApiError('You cannot bill meters.', 403));

    open();

    expect(await screen.findByText('You cannot bill meters.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bill / })).toBeNull();
  });

  it('keeps the modal open and says so if billing fails', async () => {
    vi.mocked(api.billAllMeters).mockResolvedValueOnce(result() as never).mockRejectedValueOnce(new ApiError('Boom', 500));
    const { onClose, onBilled, store } = open();

    fireEvent.click(await screen.findByRole('button', { name: /Bill 1 invoice/ }));

    await waitFor(() => expect(toasts(store)).toEqual(['error:Boom']));
    expect(onClose).not.toHaveBeenCalled();
    expect(onBilled).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Bill 1 invoice/ })).toBeEnabled();
  });
});
