'use client';

import type { ReactNode } from 'react';
import { classNames } from '@/lib/format';
import type { Tone } from '@/lib/status';

const accentBg: Record<Tone, string> = {
  green: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  gray: 'bg-ink-100 text-ink-500 dark:bg-white/5',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300',
  cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
};

export function StatCard({
  label,
  value,
  icon,
  tone = 'green',
  hint,
  delta,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  delta?: { value: string; positive?: boolean };
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.() : undefined}
      className={classNames(
        'card p-4 transition-all',
        clickable && 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {icon && (
          <span className={classNames('flex h-9 w-9 items-center justify-center rounded-xl', accentBg[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta && (
          <span className={classNames('text-xs font-semibold', delta.positive ? 'text-brand-600' : 'text-red-600')}>
            {delta.value}
          </span>
        )}
        {hint && <span className="text-xs text-ink-500">{hint}</span>}
      </div>
    </div>
  );
}
