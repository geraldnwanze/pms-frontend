'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCaptchaConfig, type CaptchaConfig } from '@/lib/captcha';

export interface CaptchaState {
  /** Still finding out whether the challenge is on. */
  loading: boolean;
  /** The challenge is on and must be passed. */
  enabled: boolean;
  /** The server says the challenge is on but has no site key to draw it with: nobody can pass it until that is fixed. */
  misconfigured: boolean;
  siteKey: string | null;
  /** Cloudflare's proof that the visitor passed, to send with the request. Null until they do (and again once it expires or is used). */
  token: string | null;
  /** The form may be submitted: the settings are known, and the challenge is either off or passed. */
  ready: boolean;
  /** A token works once: call this after any attempt that did not end the page, so the visitor ticks the box again. */
  reset: () => void;
  /** @internal for <CaptchaBox> */
  attach: (widgetId: string | null) => void;
  /** @internal for <CaptchaBox> */
  setToken: (token: string | null) => void;
}

/** State for the "I'm not a robot" challenge on a form; draw it with <CaptchaBox captcha={…} />. */
export function useCaptcha(): CaptchaState {
  const [config, setConfig] = useState<CaptchaConfig | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    void getCaptchaConfig().then((c) => live && setConfig(c));
    return () => { live = false; };
  }, []);

  const attach = useCallback((id: string | null) => { widget.current = id; }, []);

  const reset = useCallback(() => {
    setToken(null);
    if (widget.current !== null) window.turnstile?.reset(widget.current);
  }, []);

  const enabled = !!config?.enabled && !!config.siteKey;
  const misconfigured = !!config?.enabled && !config.siteKey;
  return {
    loading: config === null,
    enabled,
    misconfigured,
    siteKey: config?.siteKey ?? null,
    token,
    ready: config !== null && !misconfigured && (!enabled || token !== null),
    reset,
    attach,
    setToken,
  };
}
