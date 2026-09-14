'use client';

import { Fragment } from 'react';
import { Link } from '@/lib/router';
import { ChevronRight } from 'lucide-react';
import { classNames } from '@/lib/format';

export interface Crumb {
  label: string;
  to?: string;
}

/** Drill-down trail: Portfolio → Property → Building → Unit → Tenant → Lease → … */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            {c.to && !last ? (
              <Link to={c.to} className="font-medium text-ink-500 transition-colors hover:text-brand-600">
                {c.label}
              </Link>
            ) : (
              <span className={classNames('font-semibold', last ? 'text-ink-700' : 'text-ink-500')}>{c.label}</span>
            )}
            {!last && <ChevronRight className="h-3.5 w-3.5 text-ink-300" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
