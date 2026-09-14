'use client';

import type { ReactNode } from 'react';
import { classNames, formatCurrency, initials } from '@/lib/format';
import { toneClasses, toneDot, type Tone } from '@/lib/status';

// ---- Card ------------------------------------------------------------------

export function Card({
  children,
  className,
  padded = true,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  onClick?: () => void;
}) {
  return <div className={classNames('card', padded && 'p-5', className)} onClick={onClick}>{children}</div>;
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={classNames('card', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-ink-200/70 px-5 py-4">
          <div>
            {title && <h3 className="text-sm font-bold text-ink-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={classNames(bodyClassName ?? 'p-5')}>{children}</div>
    </div>
  );
}

// ---- Badge -----------------------------------------------------------------

export function Badge({
  tone = 'gray',
  children,
  dot = false,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={classNames('badge', toneClasses[tone], className)}>
      {dot && <span className={classNames('h-1.5 w-1.5 rounded-full', toneDot[tone])} />}
      {children}
    </span>
  );
}

export function StatusBadge({ meta, dot = true }: { meta: { label: string; tone: Tone }; dot?: boolean }) {
  return (
    <Badge tone={meta.tone} dot={dot}>
      {meta.label}
    </Badge>
  );
}

// ---- Avatar ----------------------------------------------------------------

export function Avatar({
  name,
  color = '#059669',
  size = 36,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

// ---- Money -----------------------------------------------------------------

export function Money({
  value,
  compact = false,
  className,
  colorNegative = false,
}: {
  value: number;
  compact?: boolean;
  className?: string;
  colorNegative?: boolean;
}) {
  return (
    <span
      className={classNames(
        'tabular-nums',
        colorNegative && value < 0 && 'text-red-600',
        colorNegative && value > 0 && 'text-brand-700',
        className,
      )}
    >
      {formatCurrency(value, { compact })}
    </span>
  );
}

// ---- Progress bar ----------------------------------------------------------

export function ProgressBar({
  value,
  tone = 'green',
  className,
  showLabel = false,
}: {
  value: number; // 0-100
  tone?: Tone;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={classNames('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200">
        <div className={classNames('h-full rounded-full transition-all', toneDot[tone])} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="w-10 text-right text-xs font-semibold text-ink-600">{pct.toFixed(0)}%</span>}
    </div>
  );
}

// ---- Empty state -----------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">{icon}</div>}
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---- Key/Value list --------------------------------------------------------

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-sm font-medium text-ink-800">{children}</dd>
    </div>
  );
}

// ---- Chip (filter/toggle) --------------------------------------------------

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50',
      )}
    >
      {children}
    </button>
  );
}
