'use client';

import { useEffect, useRef, useState } from 'react';
import { loadTurnstile } from '@/lib/captcha';
import type { CaptchaState } from '@/hooks/useCaptcha';

/** The "I'm not a robot" widget (Cloudflare Turnstile). Draws nothing while the challenge is off. */
export function CaptchaBox({ captcha }: { captcha: CaptchaState }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { enabled, siteKey, attach, setToken } = captcha;

  useEffect(() => {
    if (!enabled || !siteKey || !box.current) return;
    let live = true;
    const container = box.current;
    setFailed(false);
    loadTurnstile()
      .then((g) => {
        if (!live) return;
        container.innerHTML = '';
        const id = g.render(container, {
          sitekey: siteKey,
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          callback: (t) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
        attach(id ?? null);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      attach(null);
      setToken(null);
      container.innerHTML = '';
    };
  }, [enabled, siteKey, attempt, attach, setToken]);

  if (captcha.misconfigured) {
    return (
      <p role="alert" data-testid="captcha-misconfigured" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        The “I’m not a robot” check is switched on but not set up (its site key is missing), so it can’t be completed yet. Please tell your administrator.
      </p>
    );
  }
  if (!enabled) return null;

  return (
    <div data-testid="captcha-box">
      <div ref={box} className="min-h-[65px]" />
      {failed && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          The check could not load. Check your connection, then{' '}
          <button type="button" className="font-semibold underline" onClick={() => setAttempt((n) => n + 1)}>try again</button>.
        </p>
      )}
    </div>
  );
}
