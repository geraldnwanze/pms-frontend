'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Link } from '@/lib/router';
import { LogIn, Loader2 } from 'lucide-react';
import type { Role } from '@/types';
import { useAppDispatch } from '@/store/hooks';
import { signInWithPassword, signInAsUser } from '@/store/thunks';
import { homePath } from '@/components/auth/guards';
import { AuthShell } from '@/components/auth/AuthShell';
import { CaptchaBox } from '@/components/auth/CaptchaBox';
import { useCaptcha } from '@/hooks/useCaptcha';
import { Field, Input, Avatar } from '@/components/ui';
import { api, type DemoUser } from '@/lib/api';
import { ROLE_LABELS } from '@/config/roles';

export function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  const captcha = useCaptcha();

  useEffect(() => {
    api.demoUsers().then(setDemoUsers).catch(() => setDemoUsers([]));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !captcha.ready) return;
    setBusy(true);
    const user = await dispatch(signInWithPassword(email.trim(), password, captcha.token ?? undefined));
    if (user) navigate(homePath(user.role));
    else {
      setBusy(false);
      captcha.reset();          // a token works once
    }
  };

  const quickLogin = async (u: DemoUser) => {
    if (demoBusy) return;
    setDemoBusy(u.id);
    const user = await dispatch(signInAsUser(u.id));
    if (user) navigate(homePath(user.role));
    else setDemoBusy(null);
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your email and password. Your dashboard is scoped to your role."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" required>
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>

        <Field
          label="Password"
          required
          hint={
            <Link to="/forgot-password" className="text-brand-600 hover:text-brand-700">
              Forgot your password?
            </Link>
          }
        >
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <CaptchaBox captcha={captcha} />

        <button type="submit" className="btn-primary w-full justify-center" disabled={busy || !captcha.ready}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {demoUsers.length > 0 && (
        <details open className="mt-6 rounded-xl border border-ink-200 bg-white p-3.5">
          <summary className="cursor-pointer text-xs font-semibold text-ink-600">
            Demo accounts (one-click · password&nbsp;<code>password</code>)
          </summary>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {demoUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => quickLogin(u)}
                disabled={demoBusy !== null}
                className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-left text-xs hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60"
              >
                <Avatar name={u.name} color={u.avatarColor} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-800">{u.name}</span>
                  <span className="block truncate text-ink-400">
                    {ROLE_LABELS[u.role as Role]}{u.title ? ` · ${u.title}` : ''}
                  </span>
                </span>
                {demoBusy === u.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-500" />}
              </button>
            ))}
          </div>
        </details>
      )}
    </AuthShell>
  );
}
