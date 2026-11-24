import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsersRoles } from './Admin';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/users' }));

const user = (id: string, name: string, role: string, extra: object = {}) =>
  ({ id, name, email: `${id}@x.test`, role, status: 'active', twoFactorEnabled: false, avatarColor: '#64748b', ...extra });

function setup(viewer: 'admin' | 'superadmin') {
  const store = makeTestStore();
  const users = [user('admin1', 'Alice Admin', 'admin'), user('sa1', 'Sam Super', 'superadmin'), user('mgr1', 'Mia Manager', 'manager'), user('sa2', 'Sue Super', 'superadmin')];
  store.dispatch(dataActions.hydrateAll({ users, properties: [] } as never));
  store.dispatch(login({ userId: viewer === 'admin' ? 'admin1' : 'sa1', token: 't' }));
  return renderWithStore(<UsersRoles />, store);
}
const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const editButton = (name: string) => within(row(name)).queryByTitle('Edit user');

describe('Users screen and superadmin accounts', () => {
  it('shows a superadmin as Super Admin, and an admin as Admin', () => {
    setup('admin');

    expect(within(row('Sam Super')).getByText('Super Admin')).toBeInTheDocument();
    expect(within(row('Alice Admin')).getByText('Admin')).toBeInTheDocument();
  });

  it('gives an admin no way to edit a superadmin, while everyone else stays editable', () => {
    setup('admin');

    expect(editButton('Sam Super')).toBeNull();
    expect(editButton('Sue Super')).toBeNull();
    expect(editButton('Mia Manager')).not.toBeNull();
    expect(editButton('Alice Admin')).not.toBeNull();
  });

  it('lets a superadmin open a superadmin account', () => {
    setup('superadmin');

    expect(editButton('Sue Super')).not.toBeNull();
  });

  it('locks a superadmin account’s role and status, and says where they are managed', () => {
    setup('superadmin');

    fireEvent.click(editButton('Sue Super')!);

    expect(screen.getByText(/managed from the command line/)).toBeInTheDocument();
    const [role, status] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(role).toBeDisabled();
    expect(role.value).toBe('superadmin');
    expect(within(role).getByRole('option', { name: 'Super Admin' })).toBeInTheDocument();
    expect(status).toBeDisabled();
  });

  it('leaves the role and status of an ordinary account editable', () => {
    setup('superadmin');

    fireEvent.click(editButton('Mia Manager')!);

    const [role, status] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(role).toBeEnabled();
    expect(status).toBeEnabled();
    expect(screen.queryByText(/managed from the command line/)).toBeNull();
    expect(within(role).queryByRole('option', { name: 'Super Admin' })).toBeNull();     // a superadmin cannot be made here
  });

  it('keeps the edit button reachable on a narrow screen: it sticks to the right edge, and Last login drops out below lg', () => {
    setup('admin');

    const headers = screen.getAllByRole('columnheader');
    const login = headers.find((h) => /last login/i.test(h.textContent ?? ''))!;
    expect(login).toHaveClass('hidden', 'lg:table-cell');
    expect(within(row('Mia Manager')).getByTitle('Edit user').closest('td')).toHaveClass('sticky', 'right-0');
    expect(row('Mia Manager').querySelectorAll('td')[4]).toHaveClass('hidden', 'lg:table-cell');   // that column's cells too
  });
});
