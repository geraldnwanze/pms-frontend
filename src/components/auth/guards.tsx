'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/selectors';
import { bootstrap } from '@/store/thunks';
import type { Role } from '@/types';

export function homePath(role: Role | undefined): string {
  return role === 'tenant' ? '/portal' : '/dashboard';
}

function Splash({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 text-sm text-ink-400">
      {label}
    </div>
  );
}

/** Gate that requires a signed-in user id; redirects to /login otherwise. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const userId = useAppSelector((s) => s.auth.currentUserId);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) router.replace('/login');
    else setReady(true);
  }, [userId, router]);

  if (!ready) return <Splash />;
  return <BootstrapGate>{children}</BootstrapGate>;
}

/**
 * Loads the dataset from the API the first time an authenticated area renders
 * (or after a hard reload). Everything downstream can assume `data` is populated.
 */
export function BootstrapGate({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((s) => s.auth.currentUserId);
  const loaded = useAppSelector((s) => s.auth.dataReady);
  const [failed, setFailed] = useState(false);
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || loaded || startedFor.current === userId) return;
    startedFor.current = userId;
    setFailed(false);
    dispatch(bootstrap()).then((ok: boolean) => {
      if (!ok) {
        startedFor.current = null;
        setFailed(true);
      }
    });
  }, [userId, loaded, dispatch]);

  if (loaded) return <>{children}</>;

  // A 401 during bootstrap clears the session; let RequireAuth redirect to /login.
  if (!userId) return <Splash />;

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-100 text-center">
        <p className="text-sm font-semibold text-ink-700">Couldn’t reach the API server.</p>
        <p className="max-w-sm text-xs text-ink-500">
          Start the Laravel backend (<code>php artisan serve</code>) and try again.
        </p>
        <button
          className="btn-primary"
          onClick={() => {
            startedFor.current = null;
            setFailed(false);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return <Splash label="Loading your portfolio…" />;
}

/** Gate that requires the user's role to be in `roles`. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const userId = useAppSelector((s) => s.auth.currentUserId);
  const user = useAppSelector(selectCurrentUser);
  const dataReady = useAppSelector((s) => s.auth.dataReady);
  const router = useRouter();

  useEffect(() => {
    if (!userId) {
      router.replace('/login');
      return;
    }
    if (dataReady && user && !roles.includes(user.role)) {
      router.replace(homePath(user.role));
    }
  }, [userId, user, dataReady, roles, router]);

  if (!userId) return <Splash />;
  if (!dataReady || !user) return <Splash />;
  if (!roles.includes(user.role)) return <Splash />;
  return <>{children}</>;
}

/** Login page gate — sends already-authenticated users to their home area. */
export function LoginGate({ children }: { children: ReactNode }) {
  const userId = useAppSelector((s) => s.auth.currentUserId);
  const user = useAppSelector(selectCurrentUser);
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (userId) router.replace(user ? homePath(user.role) : '/');
    else setChecked(true);
  }, [userId, user, router]);

  if (userId) return <Splash />;
  if (!checked) return <Splash />;
  return <>{children}</>;
}

/** Index route — redirect to the role's landing area. */
export function HomeRedirect() {
  const user = useAppSelector(selectCurrentUser);
  const userId = useAppSelector((s) => s.auth.currentUserId);
  const router = useRouter();
  useEffect(() => {
    if (!userId) {
      router.replace('/login');
      return;
    }
    if (user) router.replace(homePath(user.role));
  }, [user, userId, router]);
  return <Splash />;
}
