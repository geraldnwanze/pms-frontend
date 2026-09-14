'use client';

import type { ReactNode } from 'react';
import { classNames } from '@/lib/format';

export interface TabDef {
  key: string;
  label: ReactNode;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={classNames('flex flex-wrap items-center gap-1 border-b border-ink-200', className)}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={classNames(
              '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={classNames(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                  isActive ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
