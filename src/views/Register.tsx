'use client';

import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from '@/lib/router';
import { UserPlus, Loader2 } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { registerAccount } from '@/store/thunks';
import { homePath } from '@/components/auth/guards';
import { AuthShell } from '@/components/auth/AuthShell';
import { CaptchaBox } from '@/components/auth/CaptchaBox';
import { useCaptcha } from '@/hooks/useCaptcha';
import { Field, Input } from '@/components/ui';

export function Register() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captcha = useCaptcha();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !captcha.ready) return;
    if (form.password !== form.password_confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    const user = await dispatch(registerAccount({ ...form, email: form.email.trim(), phone: form.phone || undefined, captchaToken: captcha.token ?? undefined }));
    if (user) navigate(homePath(user.role));
    else {
      setBusy(false);
      captcha.reset();          // a token works once
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register, then create a property to manage it as its owner — or accept an invitation to join someone else's."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" required>
          <Input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Amara Okafor" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required>
            <Input type="email" autoComplete="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.com" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+234 801 234 5678" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" required>
            <Input type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm password" required error={error ?? undefined}>
            <Input type="password" autoComplete="new-password" required value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} placeholder="Repeat password" />
          </Field>
        </div>

        <CaptchaBox captcha={captcha} />

        <button type="submit" className="btn-primary w-full justify-center" disabled={busy || !captcha.ready}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
