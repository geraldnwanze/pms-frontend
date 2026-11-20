import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';
import { Providers } from '@/app/providers';
import { store } from '@/store';
import { dismissToast } from '@/store/uiSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/login' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { login: vi.fn(), demoUsers: vi.fn() }, setAuthToken: vi.fn() }));
import { api, ApiError } from '@/lib/api';

async function signInWith(email: string, password: string) {
  render(<Providers><Login /></Providers>);
  await userEvent.type(screen.getByPlaceholderText('you@company.com'), email);
  await userEvent.type(screen.getByPlaceholderText('••••••••'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  store.getState().ui.toasts.forEach((t) => store.dispatch(dismissToast(t.id)));      // the real store is shared between tests
  vi.mocked(api.demoUsers).mockResolvedValue([]);
});

describe('Login', () => {
  it('tells a deactivated user why they cannot sign in', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError('The given data was invalid.', 422, { email: ['This account has been deactivated. Contact your administrator.'] }));

    await signInWith('aaron@x.test', 'password');

    expect(await screen.findByText('This account has been deactivated. Contact your administrator.')).toBeInTheDocument();
  });

  it('shows a wrong-password error instead of failing silently', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError('The given data was invalid.', 422, { email: ['These credentials do not match our records.'] }));

    await signInWith('someone@x.test', 'nope');

    expect(await screen.findByText('These credentials do not match our records.')).toBeInTheDocument();
  });

  it('shows the throttle message when there are too many attempts', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError('Too many login attempts. Please try again in 42 seconds.', 429, null));

    await signInWith('someone@x.test', 'nope');

    expect(await screen.findByText(/Too many login attempts/)).toBeInTheDocument();
  });

  it('lets the user try again after an error', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError('The given data was invalid.', 422, { email: ['These credentials do not match our records.'] }));

    await signInWith('someone@x.test', 'nope');
    await screen.findByText('These credentials do not match our records.');

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
