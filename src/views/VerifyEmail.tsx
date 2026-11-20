'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/lib/router';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { bootstrap } from '@/store/thunks';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '@/components/auth/AuthShell';

type Phase = 'checking' | 'done' | 'failed' | 'invalid';

/** Landing page for the link in the "Confirm your email" message. The token in the URL is the credential. */
export function VerifyEmail() {
  const dispatch = useAppDispatch();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const signedIn = useAppSelector((s) => !!s.auth.currentUserId);
  // Stored auth is only known on the client, so the footer link waits for mount to match the server-rendered HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const showAppLink = mounted && signedIn;

  const [phase, setPhase] = useState<Phase>(token && email ? 'checking' : 'invalid');
  const [message, setMessage] = useState('');
  // React strict mode runs effects twice in dev; a verification link works once, so the second call must not happen.
  const started = useRef(false);

  useEffect(() => {
    if (!token || !email || started.current) return;
    started.current = true;

    api
      .verifyEmail({ email, token })
      .then(() => {
        setPhase('done');
        if (signedIn) void dispatch(bootstrap()); // pick up emailVerified + any invitations that were waiting
      })
      .catch((err) => {
        setMessage(
          err instanceof ApiError ? (err.errors?.token?.[0] ?? err.message) : 'We could not confirm your email. Try again.',
        );
        setPhase('failed');
      });
  }, [token, email, signedIn, dispatch]);

  return (
    <AuthShell
      title="Confirm your email"
      subtitle={email || undefined}
      footer={
        <Link to={showAppLink ? '/' : '/login'} className="font-semibold text-brand-600 hover:text-brand-700">
          {showAppLink ? 'Go to the app' : 'Back to sign in'}
        </Link>
      }
    >
      {phase === 'checking' && (
        <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming your address…
        </div>
      )}

      {phase === 'done' && (
        <div role="status" className="flex gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Your email is confirmed.</p>
            <p className="mt-1">You can now see and accept property invitations sent to this address.</p>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <MailWarning className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{message}</p>
            <p className="mt-1">
              {signedIn ? 'Use “Resend email” in the banner at the top of the app to get a fresh link.' : 'Sign in, then use “Resend email” to get a fresh link.'}
            </p>
          </div>
        </div>
      )}

      {phase === 'invalid' && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This link is missing its token. Open the link from your email again, or request a new one after signing in.
        </div>
      )}
    </AuthShell>
  );
}
