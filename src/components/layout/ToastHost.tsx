'use client';

import { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dismissToast } from '@/store/uiSlice';
import { classNames } from '@/lib/format';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const TONES = {
  success: 'border-brand-200 bg-white text-brand-700',
  error: 'border-red-200 bg-white text-red-700',
  info: 'border-blue-200 bg-white text-blue-700',
};

function ToastRow({ id, kind, message }: { id: string; kind: 'success' | 'error' | 'info'; message: string }) {
  const dispatch = useAppDispatch();
  const Icon = ICONS[kind];
  useEffect(() => {
    const t = setTimeout(() => dispatch(dismissToast(id)), 4200);
    return () => clearTimeout(t);
  }, [id, dispatch]);
  return (
    <div
      className={classNames(
        'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-pop animate-slide-in',
        TONES[kind],
      )}
      role="status"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm font-medium text-ink-800">{message}</p>
      <button onClick={() => dispatch(dismissToast(id))} className="text-ink-400 hover:text-ink-700" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <ToastRow key={t.id} {...t} />
      ))}
    </div>
  );
}
