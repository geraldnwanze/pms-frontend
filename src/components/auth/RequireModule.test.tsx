import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireModule, RequireRole } from './guards';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

const path = vi.hoisted(() => ({ current: '/utilities' }));
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: () => path.current, useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock('@/store/thunks', () => ({ bootstrap: vi.fn(() => ({ type: 'test/bootstrap' })) }));

function render(role: string, modules: Record<string, boolean> | null) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({ users: [{ id: 'u1', role, name: 'U', email: 'u@x.test' }], modules } as never));
  store.dispatch(login({ userId: 'u1', token: 't' }));
  return renderWithStore(<RequireModule><p>the screen</p></RequireModule>, store);
}

beforeEach(() => { path.current = '/utilities'; replace.mockClear(); });

describe('RequireModule', () => {
  it('shows the screen while its module is on', () => {
    render('manager', { utilities: true });

    expect(screen.getByText('the screen')).toBeInTheDocument();
    expect(screen.queryByTestId('module-off')).toBeNull();
  });

  it('shows the screen until the states have loaded', () => {
    render('manager', null);

    expect(screen.getByText('the screen')).toBeInTheDocument();
  });

  it('explains instead when the module is off, and offers the way home', () => {
    render('manager', { utilities: false });

    expect(screen.queryByText('the screen')).toBeNull();
    expect(screen.getByTestId('module-off')).toHaveTextContent('This module is turned off');
    expect(screen.getByRole('link', { name: 'Go to your home' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Open Modules' })).toBeNull();
  });

  it('sends a tenant to the portal, not the staff dashboard', () => {
    path.current = '/portal/maintenance';
    render('tenant', { maintenance: false });

    expect(screen.getByRole('link', { name: 'Go to your home' })).toHaveAttribute('href', '/portal');
  });

  it('points a superadmin at the screen that turns it back on', () => {
    render('superadmin', { utilities: false });

    expect(screen.getByRole('link', { name: 'Open Modules' })).toHaveAttribute('href', '/modules');
  });

  it('only blocks the screens of the module that is off', () => {
    path.current = '/maintenance/m1';
    render('manager', { utilities: false });

    expect(screen.getByText('the screen')).toBeInTheDocument();
  });

  it('never blocks a core screen', () => {
    path.current = '/invoices';
    render('manager', { utilities: false, maintenance: false, expenses: false });

    expect(screen.getByText('the screen')).toBeInTheDocument();
  });
});

describe('RequireRole and the superadmin', () => {
  function renderRole(role: string, roles: Parameters<typeof RequireRole>[0]['roles']) {
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({ users: [{ id: 'u1', role, name: 'U', email: 'u@x.test' }] } as never));
    store.dispatch(login({ userId: 'u1', token: 't' }));
    store.dispatch({ type: 'auth/dataReady', payload: true });
    return renderWithStore(<RequireRole roles={roles}><p>admin screen</p></RequireRole>, store);
  }

  it('lets a superadmin into any screen that admits an admin', () => {
    renderRole('superadmin', ['admin']);

    expect(screen.getByText('admin screen')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('lets a superadmin into a screen only they may use', () => {
    renderRole('superadmin', ['superadmin']);

    expect(screen.getByText('admin screen')).toBeInTheDocument();
  });

  it('keeps an admin out of the superadmin-only screen and sends them home', () => {
    renderRole('admin', ['superadmin']);

    expect(screen.queryByText('admin screen')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('still keeps everyone else out of an admin screen', () => {
    renderRole('manager', ['admin']);

    expect(screen.queryByText('admin screen')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });
});
