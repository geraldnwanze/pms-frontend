import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoDebitCard } from './AutoDebitCard';
import { renderWithStore } from '@/test/utils';
import type { AutoDebitStatus } from '@/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { autoDebitStatus: vi.fn(), autoDebitSetup: vi.fn(), autoDebitCancel: vi.fn() },
  };
});
import { api, ApiError } from '@/lib/api';

const status = (over: Partial<AutoDebitStatus> = {}): AutoDebitStatus => ({
  available: true,
  enabled: false,
  status: 'none',
  card: null,
  enrolledAt: null,
  setupAmount: 50,
  maxAttempts: 3,
  upcoming: [],
  ...over,
});

const enrolled = (over: Partial<AutoDebitStatus> = {}) =>
  status({
    enabled: true,
    status: 'active',
    card: { label: 'Visa •••• 4081', brand: 'visa', last4: '4081', expMonth: '12', expYear: '2030', bank: 'GTBank' } as AutoDebitStatus['card'],
    ...over,
  });

const mocked = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AutoDebitCard', () => {
  it('invites a tenant with no card to set up auto-debit', async () => {
    mocked.autoDebitStatus.mockResolvedValue(status());
    renderWithStore(<AutoDebitCard />);
    expect(await screen.findByRole('button', { name: /set up auto-debit/i })).toBeEnabled();
    expect(screen.getByText(/refunded straight away/i)).toBeInTheDocument();
  });

  it('renders nothing when the status cannot be loaded (not a tenant / API down)', async () => {
    mocked.autoDebitStatus.mockRejectedValue(new ApiError('Forbidden', 403));
    const { container } = renderWithStore(<AutoDebitCard />);
    await waitFor(() => expect(mocked.autoDebitStatus).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when online payments are not configured', async () => {
    mocked.autoDebitStatus.mockResolvedValue(status({ available: false }));
    const { container } = renderWithStore(<AutoDebitCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('warns when the saved card has lapsed and names it', async () => {
    mocked.autoDebitStatus.mockResolvedValue(status({ status: 'expired', card: { label: 'Visa •••• 4081' } as AutoDebitStatus['card'] }));
    renderWithStore(<AutoDebitCard />);
    expect(await screen.findByText(/can no longer be charged/i)).toBeInTheDocument();
    expect(screen.getByText('Visa •••• 4081')).toBeInTheDocument();
  });

  it('shows the saved card and what is coming up when enrolled', async () => {
    mocked.autoDebitStatus.mockResolvedValue(
      enrolled({
        upcoming: [
          { invoiceId: 'i1', code: 'INV-1', amount: 5000, dueDate: '2026-11-20', state: 'scheduled', attempts: 0, nextAttemptOn: null, lastReason: null },
          { invoiceId: 'i2', code: 'INV-2', amount: 7000, dueDate: '2026-11-10', state: 'retrying', attempts: 1, nextAttemptOn: '2026-11-12', lastReason: 'Insufficient funds' },
          { invoiceId: 'i3', code: 'INV-3', amount: 9000, dueDate: '2026-11-01', state: 'manual', attempts: 3, nextAttemptOn: null, lastReason: 'Card declined' },
        ] as AutoDebitStatus['upcoming'],
      }),
    );
    renderWithStore(<AutoDebitCard />);
    expect(await screen.findByText('Visa •••• 4081')).toBeInTheDocument();
    expect(screen.getByText(/Expires 12\/30/)).toBeInTheDocument();
    expect(screen.getByText('INV-1')).toBeInTheDocument();
    expect(screen.getByText(/^Charges /)).toBeInTheDocument();
    expect(screen.getByText(/attempt 1 of 3 failed/)).toBeInTheDocument();
    expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    expect(screen.getByText('Pay manually')).toBeInTheDocument();
  });

  it('says so when nothing is queued', async () => {
    mocked.autoDebitStatus.mockResolvedValue(enrolled());
    renderWithStore(<AutoDebitCard />);
    expect(await screen.findByText(/Nothing queued/)).toBeInTheDocument();
  });

  it('sends the tenant to Paystack-hosted card entry when they set up', async () => {
    mocked.autoDebitStatus.mockResolvedValue(status());
    mocked.autoDebitSetup.mockResolvedValue({ authorizationUrl: 'https://checkout.paystack.test/abc' } as never);
    const location = { href: '' };
    vi.stubGlobal('location', location);
    renderWithStore(<AutoDebitCard />);
    await userEvent.click(await screen.findByRole('button', { name: /set up auto-debit/i }));
    await waitFor(() => expect(location.href).toBe('https://checkout.paystack.test/abc'));
  });

  it('toasts the server message and re-enables the button when setup fails', async () => {
    mocked.autoDebitStatus.mockResolvedValue(status());
    mocked.autoDebitSetup.mockRejectedValue(new ApiError('Paystack is down', 502));
    const { store } = renderWithStore(<AutoDebitCard />);
    await userEvent.click(await screen.findByRole('button', { name: /set up auto-debit/i }));
    await waitFor(() => expect(store.getState().ui.toasts.at(-1)).toMatchObject({ kind: 'error', message: 'Paystack is down' }));
    expect(screen.getByRole('button', { name: /set up auto-debit/i })).toBeEnabled();
  });

  it('asks before turning off, then cancels and reloads', async () => {
    mocked.autoDebitStatus.mockResolvedValueOnce(enrolled()).mockResolvedValueOnce(status({ status: 'cancelled' }));
    mocked.autoDebitCancel.mockResolvedValue(undefined as never);
    const { store } = renderWithStore(<AutoDebitCard />);

    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(mocked.autoDebitCancel).not.toHaveBeenCalled(); // confirmation first
    expect(await screen.findByText('Turn off auto-debit?')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: 'Turn off' });
    await userEvent.click(buttons[buttons.length - 1]); // the dialog's confirm button
    await waitFor(() => expect(mocked.autoDebitCancel).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: /set up auto-debit/i })).toBeInTheDocument();
    expect(store.getState().ui.toasts.at(-1)).toMatchObject({ kind: 'success' });
  });

  it('does not cancel when the confirmation is dismissed', async () => {
    mocked.autoDebitStatus.mockResolvedValue(enrolled());
    renderWithStore(<AutoDebitCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));
    expect(mocked.autoDebitCancel).not.toHaveBeenCalled();
  });
});
