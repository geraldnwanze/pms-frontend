'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigate, Link } from '@/lib/router';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { performPasswordReset } from '@/store/thunks';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field, Input } from '@/components/ui';

export function ResetPassword() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidLink = !token || !email;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    const ok = await dispatch(
      performPasswordReset({ email, token, password, password_confirmation: confirm }),
    );
    setBusy(false);
    if (ok) navigate('/login');
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={email ? `For ${email}` : undefined}
      footer={
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      }
    >
      {invalidLink ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This reset link is missing its token. Request a new one from{' '}
          <Link to="/forgot-password" className="font-semibold underline">
            Forgot password
          </Link>
          .
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" required>
            <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm new password" required error={error ?? undefined}>
            <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
          </Field>
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
