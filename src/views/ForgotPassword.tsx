'use client';

import { useState, type FormEvent } from 'react';
import { Link } from '@/lib/router';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { requestPasswordReset } from '@/store/thunks';
import { AuthShell } from '@/components/auth/AuthShell';
import { CaptchaBox } from '@/components/auth/CaptchaBox';
import { useCaptcha } from '@/hooks/useCaptcha';
import { Field, Input } from '@/components/ui';

export function ForgotPassword() {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | undefined>();
  const captcha = useCaptcha();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !captcha.ready) return;
    setBusy(true);
    const { ok, devUrl } = await dispatch(requestPasswordReset(email.trim(), captcha.token ?? undefined));
    setBusy(false);
    if (ok) {
      setSent(true);
      setDevUrl(devUrl);
    } else {
      captcha.reset();          // a token works once
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new password."
      footer={
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-800">
              If that email is registered, a reset link is on its way. Check your inbox and spam folder.
            </p>
          </div>
          {devUrl && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
              <p className="font-semibold">Demo shortcut</p>
              <p className="mt-1">No mail server is configured, so use this link directly:</p>
              <Link to={devUrl.replace(/^https?:\/\/[^/]+/, '')} className="mt-1 block break-all font-semibold text-amber-900 underline">
                {devUrl}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" required>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </Field>
          <CaptchaBox captcha={captcha} />
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy || !captcha.ready}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
