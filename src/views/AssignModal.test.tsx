import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignModal } from './Maintenance';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import type { MaintenanceRequest } from '@/types';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { propertyMembers: vi.fn() } }));
import { api } from '@/lib/api';

const request = { id: 'm1', propertyId: 'p1', title: 'Leaking tap', status: 'open' } as unknown as MaintenanceRequest;

// the owner can see three technicians (two on p1, one only on p2) and one vendor
const users = [
  { id: 't_aaron', role: 'maintenance', name: 'Aaron Outsider', title: 'Technician' },
  { id: 't_temi', role: 'maintenance', name: 'Temi Nwosu', title: 'Technician' },
  { id: 't_ibrahim', role: 'maintenance', name: 'Ibrahim Abubakar', title: 'Technician' },
  { id: 'mgr', role: 'manager', name: 'Manny Manager' },
  { id: 't_extra', role: 'maintenance', name: 'Extra Hands' },     // a technician elsewhere, but only an agent on this property
];
const member = (userId: string, role = 'maintenance', status = 'active') => ({ id: `mem_${userId}`, propertyId: 'p1', userId, email: `${userId}@x.test`, role, status });

function renderModal(onAssign = vi.fn()) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({ users, vendors: [{ id: 'v1', name: 'Sterling Contractors', service: 'plumbing' }] } as never));
  renderWithStore(<AssignModal request={request} onClose={vi.fn()} onAssign={onAssign} />, store);
  return onAssign;
}
const assignButton = () => screen.getByRole('button', { name: 'Assign' });
const technicianOptions = () => screen.queryAllByRole('option').map((o) => o.textContent);

beforeEach(() => vi.clearAllMocks());

describe('AssignModal', () => {
  it('asks for the work order’s own property team', async () => {
    vi.mocked(api.propertyMembers).mockResolvedValue([member('t_temi')] as never);
    renderModal();

    await waitFor(() => expect(api.propertyMembers).toHaveBeenCalledWith('p1'));
  });

  it('offers only technicians on that property, never ones who only work elsewhere', async () => {
    vi.mocked(api.propertyMembers).mockResolvedValue([member('t_temi'), member('t_ibrahim')] as never);
    renderModal();

    await waitFor(() => expect(technicianOptions()).toHaveLength(2));
    expect(technicianOptions().join(' ')).toContain('Temi Nwosu');
    expect(technicianOptions().join(' ')).toContain('Ibrahim Abubakar');
    expect(technicianOptions().join(' ')).not.toContain('Aaron Outsider');
  });

  it('preselects a technician who is on the team, not whoever sorts first', async () => {
    vi.mocked(api.propertyMembers).mockResolvedValue([member('t_ibrahim')] as never);
    const onAssign = renderModal();

    await waitFor(() => expect(assignButton()).toBeEnabled());
    await userEvent.click(assignButton());

    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ assignedToId: 't_ibrahim' }));
  });

  it('assigns the technician the user picks', async () => {
    vi.mocked(api.propertyMembers).mockResolvedValue([member('t_temi'), member('t_ibrahim')] as never);
    const onAssign = renderModal();

    await waitFor(() => expect(technicianOptions()).toHaveLength(2));
    await userEvent.selectOptions(screen.getByRole('combobox'), 't_ibrahim');
    await userEvent.type(screen.getByPlaceholderText(/OEM parts/), 'OEM taps');
    await userEvent.click(assignButton());

    expect(onAssign).toHaveBeenCalledWith({ assignedToId: 't_ibrahim', vendorId: undefined, specifiedMaterials: 'OEM taps' });
  });

  it('ignores people who were invited, revoked, or hold another role', async () => {
    vi.mocked(api.propertyMembers).mockResolvedValue([
      member('t_temi', 'maintenance', 'invited'), member('t_ibrahim', 'maintenance', 'revoked'), member('mgr', 'manager'), member('t_extra', 'agent'), member('t_aaron'),
    ] as never);
    renderModal();

    await waitFor(() => expect(technicianOptions()).toHaveLength(1));
    expect(technicianOptions()[0]).toContain('Aaron Outsider');
  });

  it('cannot be submitted while the team is still loading', () => {
    vi.mocked(api.propertyMembers).mockReturnValue(new Promise(() => {}) as never);
    renderModal();

    expect(screen.getByText(/Loading this property’s team/)).toBeInTheDocument();
    expect(assignButton()).toBeDisabled();
  });

  it('says so, and blocks assigning, when nobody on the team is a technician', async () => {
    vi.mocked(api.propertyMembers).mockResolvedValue([member('mgr', 'manager')] as never);
    const onAssign = renderModal();

    expect(await screen.findByText(/No technicians are on this property’s team/)).toBeInTheDocument();
    expect(assignButton()).toBeDisabled();
    await userEvent.click(assignButton());
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('still lets the user choose an external vendor when there is no in-house team', async () => {
    vi.mocked(api.propertyMembers).mockResolvedValue([] as never);
    const onAssign = renderModal();

    await screen.findByText(/No technicians are on this property’s team/);
    await userEvent.click(screen.getByRole('button', { name: 'External vendor' }));
    await userEvent.click(assignButton());

    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ vendorId: 'v1', assignedToId: undefined }));
  });

  it('explains a failure to load the team instead of showing a stale list', async () => {
    vi.mocked(api.propertyMembers).mockRejectedValue(new Error('offline'));
    renderModal();

    expect(await screen.findByText(/couldn’t load this property’s team/)).toBeInTheDocument();
    expect(technicianOptions()).toHaveLength(0);
    expect(assignButton()).toBeDisabled();
  });
});
