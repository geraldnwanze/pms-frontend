import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaymentReviewModal } from './PaymentReviewModal';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({}) }));

function setup(role: string) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'me', role, name: 'Me', email: 'me@x.test', tenantId: 't1' }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    units: [{ id: 'u1', propertyId: 'p1', code: 'A01' }],
    tenants: [{ id: 't1', name: 'Ada Obi' }],
    invoices: [{ id: 'i1', code: 'INV-1', propertyId: 'p1', unitId: 'u1', leaseId: 'l1', tenantId: 't1', status: 'fully-paid', total: 100_000, amountPaid: 100_000, lineItems: [], issueDate: '2026-10-01', dueDate: '2026-10-15', cycle: 'monthly' }],
    payments: [{ id: 'pay1', code: 'PAY-1', invoiceId: 'i1', leaseId: 'l1', unitId: 'u1', propertyId: 'p1', tenantId: 't1', type: 'rent', method: 'cash', amount: 100_000, paymentDate: '2026-10-10', reference: 'r', status: 'approved', submittedAt: '2026-10-10T10:00:00Z' }],
  } as never));
  store.dispatch(login({ userId: 'me', token: 't' }));
  renderWithStore(<PaymentReviewModal paymentId="pay1" onClose={() => {}} />, store);
}

describe('PaymentReviewModal unit link', () => {
  it('links staff to the unit page', () => {
    setup('manager');

    expect(screen.getByRole('button', { name: 'A01' })).toBeInTheDocument();
  });

  it('shows a tenant the unit code as plain text, since the unit page is staff-only', () => {
    setup('tenant');

    expect(screen.getByText('A01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A01' })).toBeNull();
  });
});
