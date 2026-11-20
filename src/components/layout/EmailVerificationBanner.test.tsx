import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { resendVerification: vi.fn() } }));
import { api, ApiError } from '@/lib/api';

function storeWith(emailVerified: boolean | undefined) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({ users: [{ id: 'u1', name: 'Newbie', email: 'newbie@x.test', role: 'user', emailVerified }] } as never));
  store.dispatch(login({ userId: 'u1', token: 't' }));
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('EmailVerificationBanner', () => {
  it('asks an unconfirmed account to confirm, naming the address', () => {
    renderWithStore(<EmailVerificationBanner />, storeWith(false));
    expect(screen.getByText('newbie@x.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeEnabled();
  });

  it('is hidden for confirmed accounts, unknown status, and signed-out visitors', () => {
    for (const verified of [true, undefined]) {
      const { container, unmount } = renderWithStore(<EmailVerificationBanner />, storeWith(verified));
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    const { container } = renderWithStore(<EmailVerificationBanner />, makeTestStore());
    expect(container).toBeEmptyDOMElement();
  });

  it('resends once, confirms with a toast, and stops further clicks', async () => {
    vi.mocked(api.resendVerification).mockResolvedValue({} as never);
    const store = storeWith(false);
    renderWithStore(<EmailVerificationBanner />, store);

    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Email sent' })).toBeDisabled());
    expect(api.resendVerification).toHaveBeenCalledOnce();
    expect(store.getState().ui.toasts.at(-1)).toMatchObject({ kind: 'success' });
  });

  it('explains a rate limit instead of showing a raw error, and lets the user retry', async () => {
    vi.mocked(api.resendVerification).mockRejectedValue(new ApiError('Too Many Attempts.', 429));
    const store = storeWith(false);
    renderWithStore(<EmailVerificationBanner />, store);

    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }));

    await waitFor(() => expect(store.getState().ui.toasts.at(-1)).toMatchObject({ kind: 'error', message: 'Please wait a minute before asking again.' }));
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeEnabled();
  });
});
