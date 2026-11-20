import { screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmail } from './VerifyEmail';
import { makeTestStore } from '@/test/utils';
import { login } from '@/store/authSlice';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn() }));
vi.mock('@/store/thunks', () => ({ bootstrap: vi.fn(() => () => Promise.resolve(true)) }));
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { verifyEmail: vi.fn() } }));
import { api, ApiError } from '@/lib/api';
import { bootstrap } from '@/store/thunks';

function show(query: string, signedIn = false, strict = false) {
  search = query;
  const store = makeTestStore();
  if (signedIn) store.dispatch(login({ userId: 'u1', token: 't' }));
  const tree = <Provider store={store}><VerifyEmail /></Provider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => vi.clearAllMocks());

describe('VerifyEmail', () => {
  it('confirms the address from the link and says what that unlocks', async () => {
    vi.mocked(api.verifyEmail).mockResolvedValue({} as never);
    show('?token=abc&email=a%40x.test');

    expect(await screen.findByText('Your email is confirmed.')).toBeInTheDocument();
    expect(api.verifyEmail).toHaveBeenCalledWith({ email: 'a@x.test', token: 'abc' });
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('uses the link only once even under React strict mode (a link works a single time)', async () => {
    vi.mocked(api.verifyEmail).mockResolvedValue({} as never);
    show('?token=abc&email=a%40x.test', false, true);

    await screen.findByText('Your email is confirmed.');
    expect(api.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('shows the server reason when the link is bad or expired', async () => {
    vi.mocked(api.verifyEmail).mockRejectedValue(new ApiError('Invalid.', 422, { token: ['This verification link is invalid or has expired. Request a new one.'] }));
    show('?token=old&email=a%40x.test');

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });

  it('does not call the API when the link has no token or email', () => {
    show('?email=a%40x.test');

    expect(screen.getByRole('alert')).toHaveTextContent('missing its token');
    expect(api.verifyEmail).not.toHaveBeenCalled();
  });

  it('refreshes the session data when the user is signed in, so the banner and invitations update', async () => {
    vi.mocked(api.verifyEmail).mockResolvedValue({} as never);
    show('?token=abc&email=a%40x.test', true);

    await waitFor(() => expect(bootstrap).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Go to the app' })).toHaveAttribute('href', '/');
  });

  it('does not touch the session when signed out', async () => {
    vi.mocked(api.verifyEmail).mockResolvedValue({} as never);
    show('?token=abc&email=a%40x.test');

    await screen.findByText('Your email is confirmed.');
    expect(bootstrap).not.toHaveBeenCalled();
  });
});
