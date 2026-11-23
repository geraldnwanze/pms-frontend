import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortalBills, PortalHome, PortalLease } from './Portal';
import { PortalInvoice } from './PortalInvoice';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

const paramId = vi.hoisted(() => 'i1');
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/portal' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({ id: paramId }) }));

const invoice = (over: object) => ({
  id: 'i1', code: 'INV-1', propertyId: 'p1', unitId: 'u1', leaseId: 'l1', tenantId: 't1', status: 'overdue', cycle: 'monthly',
  issueDate: '2026-10-01', dueDate: '2026-10-15', lineItems: [{ id: 'li', type: 'rent', description: 'Rent', amount: 100_000 }],
  total: 100_000, amountPaid: 0, ...over,
});

function renderPortal(view: React.ReactElement, invoices: object[], lease: object = {}, meters: object[] = []) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'tu', role: 'tenant', name: 'Ada Obi', email: 'a@x.test', tenantId: 't1' }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    units: [{ id: 'u1', propertyId: 'p1', buildingId: 'b1', code: 'A01', type: 'Flat', status: 'occupied', bedrooms: 2, bathrooms: 2, sizeSqm: 80, parkingSpaces: 1, floor: 1, furnishing: 'Unfurnished', amenities: [] }],
    tenants: [{ id: 't1', name: 'Ada Obi', email: 'a@x.test' }],
    leases: [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', billingCycle: 'monthly', rent: 1_200_000, securityDeposit: 500_000, startDate: '2026-01-01', endDate: '2026-12-31', noticePeriodDays: 90, ...lease }],
    invoices,
    meters,
  } as never));
  store.dispatch(login({ userId: 'tu', token: 't' }));
  renderWithStore(view, store);
}

describe('tenant portal late fees', () => {
  it('tells the tenant what part of a bill is a late fee', () => {
    renderPortal(<PortalBills />, [invoice({ penalty: 10_000, total: 110_000 })]);

    expect(screen.getByText('Includes a ₦10,000 late fee')).toBeInTheDocument();
    expect(screen.getByText('incl. ₦10,000 late fee')).toBeInTheDocument();
  });

  it('says nothing about late fees on a bill without one', () => {
    renderPortal(<PortalBills />, [invoice({})]);

    expect(screen.queryByText(/late fee/i)).toBeNull();
  });

  it('notes a waived late fee in the invoice list', () => {
    renderPortal(<PortalBills />, [invoice({ penalty: 0, lateFeeWaivedOn: '2026-11-18' })]);

    expect(screen.getByText('late fee waived')).toBeInTheDocument();
  });
});

describe('tenant portal deposit', () => {
  it('shows what is actually held and what is still to pay', () => {
    renderPortal(<PortalLease />, [], { depositLedger: [{ id: 'e1', type: 'received', amount: 200_000, date: '2026-01-01', note: '' }] });

    expect(screen.getByText(/₦300,000 of the ₦500,000 deposit is still to be paid/)).toBeInTheDocument();
    expect(screen.getByText('Deposit held in trust').parentElement!.textContent).toContain('200,000');
  });

  it('does not nag about a deposit paid in full', () => {
    renderPortal(<PortalLease />, [], { depositLedger: [{ id: 'e1', type: 'received', amount: 500_000, date: '2026-01-01', note: '' }] });

    expect(screen.queryByText(/still to be paid/)).toBeNull();
  });
});

const meter = (over: object) => ({
  id: 'm', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh',
  previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [], ...over,
});

describe('tenant home utilities tile', () => {
  it('shows what the unit has used since its meters were last billed', () => {
    renderPortal(<PortalHome />, [], {}, [
      meter({ id: 'e' }),                                                                                                          // 150 × 60 = 9,000
      meter({ id: 'w', type: 'water', unitOfMeasure: 'm³', ratePerUnit: 350, previousReading: 200, currentReading: 214 }),       // 14 × 350 = 4,900
    ]);

    const tile = screen.getByText('Utilities not yet billed').closest('[role="button"]')!;
    expect(tile.textContent).toContain('13,900');
    expect(tile.textContent).toContain('2 meters on your unit');
  });

  it('counts only use after the reading a meter was last billed up to', () => {
    renderPortal(<PortalHome />, [], {}, [meter({ billedReading: 230 })]);        // 20 × 60

    const tile = screen.getByText('Utilities not yet billed').closest('[role="button"]')!;
    expect(tile.textContent).toContain('1,200');
    expect(tile.textContent).toContain('1 meter on your unit');
  });

  it('is left out when the unit has no meters', () => {
    renderPortal(<PortalHome />, [], {}, []);

    expect(screen.queryByText('Utilities not yet billed')).toBeNull();
  });

  it('ignores meters on other units', () => {
    renderPortal(<PortalHome />, [], {}, [meter({ unitId: 'u2' })]);

    expect(screen.queryByText('Utilities not yet billed')).toBeNull();
  });
});

describe('tenant lease page', () => {
  it('counts the days left on a current lease', () => {
    renderPortal(<PortalLease />, []);

    expect(screen.getByText('Days remaining')).toBeInTheDocument();
  });

  it('does not count down a lease that has ended', () => {
    renderPortal(<PortalLease />, [], { status: 'terminated' });

    expect(screen.queryByText('Days remaining')).toBeNull();
    expect(screen.getByText('Ended early')).toBeInTheDocument();
  });

  it('says the day a lease ended early, which is not the contract end date', () => {
    renderPortal(<PortalLease />, [], { status: 'terminated', terminatedOn: '2026-11-20' });

    expect(screen.getByText('Ended on').parentElement).toHaveTextContent('20 Nov 2026');
    expect(screen.getByText('End date').parentElement).toHaveTextContent('31 Dec 2026');
  });

  it('says when a lease that ran out ended, and nothing for one that is still running', () => {
    renderPortal(<PortalLease />, [], { status: 'expired', endDate: '2026-10-15' });
    expect(screen.getByText('Ended on').parentElement).toHaveTextContent('15 Oct 2026');
  });

  it('has no "ended on" line while the lease runs', () => {
    renderPortal(<PortalLease />, []);

    expect(screen.queryByText('Ended on')).toBeNull();
  });
});

describe('tenant deposit history', () => {
  const received = { id: 'e1', type: 'received', amount: 500_000, date: '2026-01-01', note: 'Deposit received by cash' };

  it('lists what the tenant paid, in their own words', () => {
    renderPortal(<PortalLease />, [], { depositLedger: [received] });

    expect(screen.getByText('Deposit history')).toBeInTheDocument();
    expect(screen.getByText('You paid')).toBeInTheDocument();
    expect(screen.queryByText(/of the .* you paid/i)).toBeNull();      // nothing to summarise until it is settled
  });

  it('shows where a settled deposit went: kept, used on an invoice, refunded', () => {
    renderPortal(<PortalLease />, [], {
      status: 'terminated', depositSettledOn: '2026-11-18',
      depositLedger: [received,
        { id: 'e2', type: 'deduction', amount: 50_000, date: '2026-11-18', note: 'Broken window' },
        { id: 'e3', type: 'offset', amount: 100_000, date: '2026-11-18', note: 'Applied to invoice INV-1' },
        { id: 'e4', type: 'refund', amount: 350_000, date: '2026-11-18', note: 'Balance refunded to the tenant' }],
    });

    expect(screen.getByText('Kept for a charge')).toBeInTheDocument();
    expect(screen.getByText('Used to pay an invoice')).toBeInTheDocument();
    expect(screen.getByText('Refunded to you')).toBeInTheDocument();
    expect(screen.getByText(/Of the ₦500,000 you paid: ₦50,000 was kept, ₦100,000 was used to pay your invoices, and ₦350,000 was refunded to you/)).toBeInTheDocument();
  });

  it('says nothing when no deposit has been touched', () => {
    renderPortal(<PortalLease />, []);

    expect(screen.queryByText('Deposit history')).toBeNull();
  });
});

describe('tenant invoice page', () => {
  it('itemises the bill with its late fee and what is still owed', () => {
    renderPortal(<PortalInvoice />, [invoice({ penalty: 10_000, total: 110_000, amountPaid: 40_000, status: 'partially-paid' })]);

    expect(screen.getByText('Late fee').parentElement!.textContent).toContain('10,000');
    expect(screen.getByText('Outstanding').parentElement!.textContent).toContain('70,000');
    expect(screen.getByText(/charged once/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /pay/i }).length).toBeGreaterThan(0);
  });

  it('shows a waived fee as waived, with no explanation of a charge', () => {
    renderPortal(<PortalInvoice />, [invoice({ penalty: 0, lateFeeWaivedOn: '2026-11-18' })]);

    expect(screen.getByText('waived')).toBeInTheDocument();
    expect(screen.queryByText(/charged once/)).toBeNull();
  });

  it('offers no payment on a settled invoice', () => {
    renderPortal(<PortalInvoice />, [invoice({ status: 'fully-paid', amountPaid: 100_000 })]);

    expect(screen.queryByRole('button', { name: /pay/i })).toBeNull();
  });

  it('opens a cancelled invoice (from its notice) with no way to pay it', () => {
    renderPortal(<PortalInvoice />, [invoice({ status: 'cancelled' })]);

    expect(screen.getAllByText('INV-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /pay/i })).toBeNull();
    expect(screen.getByText('Outstanding').parentElement!.textContent).toContain('₦0');         // nothing is owed on it
    expect(screen.getByText('Outstanding').parentElement!.textContent).not.toContain('100,000');
  });

  it('will not show another tenant’s invoice', () => {
    renderPortal(<PortalInvoice />, [invoice({ tenantId: 'someone-else' })]);

    expect(screen.getByText('Invoice not found')).toBeInTheDocument();
    expect(screen.queryByText('INV-1')).toBeNull();
  });
});

describe('tenant invoice: utility lines link to their readings', () => {
  const meter = { id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh', previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [] };
  const utilityLine = { id: 'lu', type: 'utility', description: 'Electricity MTR-1: 150 kWh × ₦60.00', amount: 9_000, meterId: 'm1', fromReading: 100, toReading: 250 };

  it('shows the billed readings and a link to the meter on the tenant’s Utilities page', () => {
    renderPortal(<PortalInvoice />, [invoice({ lineItems: [utilityLine], total: 9_000 })], {}, [meter]);

    expect(screen.getByText('Read 100 → 250 kWh')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See readings/ })).toHaveAttribute('href', '/portal/utilities?meter=m1');
  });

  it('adds nothing to a rent line, or to a utility line whose meter is gone', () => {
    renderPortal(<PortalInvoice />, [invoice({ lineItems: [{ id: 'li', type: 'rent', description: 'Rent', amount: 100_000 }, { ...utilityLine, meterId: 'gone' }] })], {}, [meter]);

    expect(screen.queryByRole('link', { name: /See readings/ })).toBeNull();
  });
});
