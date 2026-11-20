import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceAutoDebitCard } from './InvoiceAutoDebitCard';
import type { AutoDebitInvoiceDetail } from '@/types';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { autoDebitInvoice: vi.fn() } }));
import { api } from '@/lib/api';
const mocked = vi.mocked(api);

const attempt = (over: Record<string, unknown> = {}) => ({
  attemptNo: 1, amount: 5000, status: 'failed', reason: 'Insufficient funds', attemptedAt: '2026-11-10T07:30:00Z', nextAttemptOn: '2026-11-11', ...over,
});
const detail = (over: Partial<AutoDebitInvoiceDetail> = {}) =>
  ({ enrolled: true, state: 'scheduled', maxAttempts: 3, attempts: [], ...over }) as AutoDebitInvoiceDetail;

beforeEach(() => vi.clearAllMocks());

describe('InvoiceAutoDebitCard', () => {
  it('is hidden when the tenant is not enrolled and nothing was ever attempted', async () => {
    mocked.autoDebitInvoice.mockResolvedValue(detail({ enrolled: false, state: null as never }));
    const { container } = render(<InvoiceAutoDebitCard invoiceId="i1" />);
    await waitFor(() => expect(mocked.autoDebitInvoice).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden when the API refuses (roles without access)', async () => {
    mocked.autoDebitInvoice.mockRejectedValue(new Error('403'));
    const { container } = render(<InvoiceAutoDebitCard invoiceId="i1" />);
    await waitFor(() => expect(mocked.autoDebitInvoice).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('explains a scheduled charge when enrolled with no attempts yet', async () => {
    mocked.autoDebitInvoice.mockResolvedValue(detail());
    render(<InvoiceAutoDebitCard invoiceId="i1" />);
    expect(await screen.findByText('Tenant has auto-debit on.')).toBeInTheDocument();
    expect(screen.getByText(/saved card on the due date/i)).toBeInTheDocument();
  });

  it('tells staff to chase payment after every attempt failed', async () => {
    mocked.autoDebitInvoice.mockResolvedValue(
      detail({ state: 'manual', attempts: [attempt({ attemptNo: 1 }), attempt({ attemptNo: 2 }), attempt({ attemptNo: 3, nextAttemptOn: null })] as never }),
    );
    render(<InvoiceAutoDebitCard invoiceId="i1" />);
    expect(await screen.findByText(/All 3 attempts failed/)).toBeInTheDocument();
    expect(screen.getByText('Attempt 3')).toBeInTheDocument();
    expect(screen.getAllByText('Insufficient funds')).toHaveLength(3);
  });

  it('shows the next retry and how many attempts are used', async () => {
    mocked.autoDebitInvoice.mockResolvedValue(detail({ state: 'retrying', attempts: [attempt()] as never }));
    render(<InvoiceAutoDebitCard invoiceId="i1" />);
    expect(await screen.findByText(/1 of 3 used/)).toBeInTheDocument();
  });

  it('still shows history after the tenant turned auto-debit off', async () => {
    mocked.autoDebitInvoice.mockResolvedValue(detail({ enrolled: false, state: 'paid', attempts: [attempt({ status: 'success', reason: null })] as never }));
    render(<InvoiceAutoDebitCard invoiceId="i1" />);
    expect(await screen.findByText(/turned auto-debit off/)).toBeInTheDocument();
    expect(screen.getByText(/· Paid$/)).toBeInTheDocument();
  });

  it('reloads when the invoice changes and ignores a stale response', async () => {
    let resolveFirst!: (d: AutoDebitInvoiceDetail) => void;
    mocked.autoDebitInvoice
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(detail({ state: 'manual', attempts: [attempt({ reason: 'Second invoice' })] as never }));
    const { rerender } = render(<InvoiceAutoDebitCard invoiceId="i1" />);
    rerender(<InvoiceAutoDebitCard invoiceId="i2" />);
    expect(await screen.findByText('Second invoice')).toBeInTheDocument();
    resolveFirst(detail({ attempts: [attempt({ reason: 'First invoice' })] as never }));
    await Promise.resolve();
    expect(screen.queryByText('First invoice')).not.toBeInTheDocument();
  });
});
