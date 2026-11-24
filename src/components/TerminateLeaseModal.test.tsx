import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminateLeaseModal } from './TerminateLeaseModal';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { terminateLease: vi.fn() } }));
vi.mock('@/store/thunks', () => ({ bootstrap: vi.fn(() => ({ type: 'test/bootstrap' })) }));
import { api, ApiError } from '@/lib/api';
import { bootstrap } from '@/store/thunks';

const lease = { id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', startDate: '2000-01-01', endDate: '2999-12-31' } as never;
const meter = (over: object) => ({ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh', previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [], ...over });

function open(meters: object[] = [meter({}), meter({ id: 'm2', type: 'water', meterNumber: 'WTR-2', unitOfMeasure: 'm³', previousReading: 10, currentReading: 20, ratePerUnit: 200 })], extra: object = {}) {
  const onClose = vi.fn();
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({ meters, leases: [lease], ...extra } as never));
  renderWithStore(<TerminateLeaseModal lease={lease} unitCode="A01" tenantName="Ada Obi" onClose={onClose} />, store);
  return { onClose, store };
}
const field = (n: string) => screen.getByLabelText(new RegExp(n)) as HTMLInputElement;
const type = (n: string, v: string) => fireEvent.change(field(n), { target: { value: v } });
const toasts = (store: ReturnType<typeof makeTestStore>) => store.getState().ui.toasts.map((t) => `${t.kind}:${t.message}`);

beforeEach(() => vi.clearAllMocks());

describe('TerminateLeaseModal', () => {
  it('lists the unit’s meters with their current reading filled in, and bills what is already waiting', () => {
    open();

    expect(field('MTR-1').value).toBe('250');
    expect(field('WTR-2').value).toBe('20');
    expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('Final utility bill to Ada Obi');
    expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('11,000');                       // 150 × ₦60 + 10 × ₦200
    expect(screen.getByRole('button', { name: 'Terminate & bill ₦11,000' })).toBeEnabled();
  });

  it('updates the line and the total as a closing reading is typed', () => {
    open();

    type('MTR-1', '300');

    const row = screen.getAllByTestId('closing-meter')[0];
    expect(row).toHaveTextContent('100 → 300 kWh · 200 × ₦60');
    expect(row).toHaveTextContent('₦12,000');
    expect(screen.getByRole('button', { name: 'Terminate & bill ₦14,000' })).toBeInTheDocument();      // 12,000 + the water's 2,000
  });

  it('counts from where each meter was last billed, not from its previous reading', () => {
    open([meter({ billedReading: 200 })]);

    expect(screen.getAllByTestId('closing-meter')[0]).toHaveTextContent('200 → 250 kWh · 50 × ₦60');
    expect(screen.getByRole('button', { name: 'Terminate & bill ₦3,000' })).toBeInTheDocument();
  });

  it('refuses a reading below the current one: it is flagged, not counted, and nothing can be confirmed', () => {
    open();

    type('MTR-1', '240');

    expect(field('MTR-1')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByTestId('closing-meter')[0]).toHaveTextContent('Not below the current reading (250 kWh).');
    expect(screen.getByRole('button', { name: /Terminate/ })).toBeDisabled();
    expect(screen.getAllByTestId('closing-meter')[0]).toHaveTextContent('—');                          // no amount for a wrong reading
    expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('Correct the highlighted reading to see the final utility bill.');
    expect(screen.getByTestId('final-bill-summary')).not.toHaveTextContent('₦');                       // nothing is totalled while a reading is wrong
    expect(screen.getByRole('button', { name: 'Terminate lease' })).toBeDisabled();
  });

  it('totals again as soon as the reading is corrected', () => {
    open();

    type('MTR-1', '240');
    type('MTR-1', '300');

    expect(field('MTR-1')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('14,000');
    expect(screen.getByRole('button', { name: /Terminate & bill/ })).toBeEnabled();
  });

  it('refuses an emptied field as well', () => {
    open();

    type('MTR-1', '');

    expect(screen.getByRole('button', { name: /Terminate/ })).toBeDisabled();
  });

  it('shows only the meters on this lease’s unit', () => {
    open([meter({}), meter({ id: 'm9', unitId: 'other', meterNumber: 'MTR-OTHER' })]);

    expect(screen.queryByLabelText(/MTR-OTHER/)).toBeNull();
    expect(screen.getAllByTestId('closing-meter')).toHaveLength(1);
  });

  describe('confirming', () => {
    it('sends only the readings that were changed, then reports the final bill the server raised', async () => {
      vi.mocked(api.terminateLease).mockResolvedValue({ data: {}, message: null, meta: { finalBill: { id: 'inv1', code: 'INV-X1', total: 14_000 } } } as never);
      const { onClose, store } = open();
      type('MTR-1', '300');                                                                           // the water meter is left as it is

      fireEvent.click(screen.getByRole('button', { name: /Terminate & bill/ }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(api.terminateLease).toHaveBeenCalledWith('l1', [{ meterId: 'm1', value: 300 }]);
      expect(toasts(store)).toEqual(['success:LSE-1 terminated. Final utility bill INV-X1 for ₦14,000 raised.']);
      expect(bootstrap).toHaveBeenCalled();                                                           // the store catches up with the server
    });

    it('sends no readings when none were changed', async () => {
      vi.mocked(api.terminateLease).mockResolvedValue({ data: {}, message: null, meta: { finalBill: null } } as never);
      const { onClose } = open();

      fireEvent.click(screen.getByRole('button', { name: /Terminate/ }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(api.terminateLease).toHaveBeenCalledWith('l1', []);
    });

    it('says plainly when no final bill was raised', async () => {
      vi.mocked(api.terminateLease).mockResolvedValue({ data: {}, message: null, meta: { finalBill: null } } as never);
      const { onClose, store } = open();

      fireEvent.click(screen.getByRole('button', { name: /Terminate/ }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(toasts(store)).toEqual(['success:LSE-1 terminated.']);
    });

    it('keeps the dialog open and shows the server’s reason if it is refused', async () => {
      vi.mocked(api.terminateLease).mockRejectedValue(new ApiError('MTR-1: the closing reading (240) is lower than the current reading (250).', 422));
      const { onClose, store } = open();

      fireEvent.click(screen.getByRole('button', { name: /Terminate/ }));

      await waitFor(() => expect(toasts(store)).toEqual(['error:MTR-1: the closing reading (240) is lower than the current reading (250).']));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Terminate/ })).toBeEnabled();
      expect(bootstrap).not.toHaveBeenCalled();
    });
  });

  describe('when there is nothing to bill, or nobody to bill', () => {
    it('says so when every meter is already billed up to its reading', () => {
      open([meter({ billedReading: 250 })]);

      expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('No utility use is waiting to be billed.');
      expect(screen.getByRole('button', { name: 'Terminate lease' })).toBeEnabled();
    });

    it('offers a plain confirmation, without a readings section, when the unit has no meters', async () => {
      vi.mocked(api.terminateLease).mockResolvedValue({ data: {}, message: null, meta: { finalBill: null } } as never);
      const { onClose } = open([]);

      expect(screen.queryByTestId('closing-meters')).toBeNull();
      expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('There are no meters on this unit, so no final utility bill.');
      fireEvent.click(screen.getByRole('button', { name: 'Terminate lease' }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(api.terminateLease).toHaveBeenCalledWith('l1', []);
    });

    it('warns when someone else already holds the unit: the readings can still be taken, but no final bill is raised', () => {
      const next = { id: 'l2', code: 'LSE-2', propertyId: 'p1', unitId: 'u1', tenantId: 't2', status: 'active', startDate: '2000-01-01', endDate: '2999-12-31' };
      open(undefined, { leases: [lease, next] });

      expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('Someone else already holds this unit, so no final utility bill is raised.');
      expect(screen.getByRole('button', { name: 'Terminate lease' })).toBeEnabled();
      expect(screen.getAllByTestId('closing-meter')).toHaveLength(2);
    });

    it('does not count a meter with no rate, and says why', () => {
      open([meter({ ratePerUnit: 0 })]);

      expect(screen.getAllByTestId('closing-meter')[0]).toHaveTextContent("No rate is set, so this meter's use cannot be billed.");
      expect(screen.getByRole('button', { name: 'Terminate lease' })).toBeInTheDocument();
    });
  });

  it('can be cancelled without calling the server', () => {
    const { onClose } = open();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(api.terminateLease).not.toHaveBeenCalled();
  });

  describe('when the Utilities module is off', () => {
    const utilitiesOff = { modules: { utilities: false } };

    it('is just a confirmation: no readings to take, no final bill, and it says why', () => {
      open(undefined, utilitiesOff);

      expect(screen.queryByTestId('closing-meters')).toBeNull();
      expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('Utilities is turned off, so no final utility bill is raised.');
      expect(screen.getByTestId('final-bill-summary')).not.toHaveTextContent('₦');
      expect(screen.getByRole('button', { name: 'Terminate lease' })).toBeEnabled();
    });

    it('ends the lease with no closing readings even though the unit has meters', async () => {
      vi.mocked(api.terminateLease).mockResolvedValue({ data: {}, message: null, meta: { finalBill: null } } as never);
      const { onClose } = open(undefined, utilitiesOff);

      fireEvent.click(screen.getByRole('button', { name: 'Terminate lease' }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(api.terminateLease).toHaveBeenCalledWith('l1', []);
    });

    it('is unaffected when some other module is the one that is off', () => {
      open(undefined, { modules: { maintenance: false } });

      expect(screen.getAllByTestId('closing-meter')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Terminate & bill ₦11,000' })).toBeEnabled();
    });
  });
});
