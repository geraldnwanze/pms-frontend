'use client';

import { useState } from 'react';
import { MailWarning, Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/selectors';
import { pushToast } from '@/store/uiSlice';
import { api, ApiError } from '@/lib/api';
import { uid } from '@/lib/format';

/**
 * Shown to signed-in accounts whose email address is not confirmed yet. Until it is, the server will not show or
 * accept property invitations for them, so the banner says so and offers a fresh link.
 */
export function EmailVerificationBanner() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerified !== false) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await api.resendVerification();
      setSent(true);
      dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Confirmation email sent to ${user.email}.` }));
    } catch (err) {
      const message = err instanceof ApiError && err.status === 429 ? 'Please wait a minute before asking again.' : err instanceof ApiError ? err.message : 'Could not send the email.';
      dispatch(pushToast({ id: uid('t'), kind: 'error', message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2">
        <MailWarning className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          Confirm <b>{user.email}</b> to see and accept property invitations. We sent you a link when you signed up.
        </p>
        <button className="btn-secondary shrink-0" onClick={resend} disabled={busy || sent}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {sent ? 'Email sent' : 'Resend email'}
        </button>
      </div>
    </div>
  );
}
