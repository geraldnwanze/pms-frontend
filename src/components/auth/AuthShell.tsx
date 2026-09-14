'use client';

import type { ReactNode } from 'react';
import { Building2, BadgeCheck, ReceiptText, BarChart3 } from 'lucide-react';
import { classNames } from '@/lib/format';

/** Split-screen frame shared by the sign-in / register / password screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-ink-100">
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-600/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 shadow-lg">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-lg font-extrabold tracking-tight">EstateHub</p>
            <p className="text-xs text-ink-400">Property Management System</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="text-3xl font-extrabold leading-tight">
            Every property, tenant and naira —<span className="text-brand-400"> in one place.</span>
          </h1>
          <p className="max-w-md text-sm text-ink-300">
            Manage portfolios end to end: leases, rent collection with receipt verification,
            maintenance, inspections and financial reporting across your entire estate.
          </p>
          <ul className="space-y-3 text-sm">
            <Feature icon={<BadgeCheck className="h-4 w-4" />} text="Tenant-uploaded receipts verified by finance before rent is credited" />
            <Feature icon={<ReceiptText className="h-4 w-4" />} text="Automated invoicing across monthly, quarterly & annual cycles" />
            <Feature icon={<BarChart3 className="h-4 w-4" />} text="Role-based dashboards — owners, managers, finance, agents & tenants" />
          </ul>
        </div>

        <p className="relative text-xs text-ink-500">Figures in ₦ · demo environment</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
              <Building2 className="h-5 w-5" />
            </span>
            <p className="text-lg font-extrabold tracking-tight text-ink-900">EstateHub</p>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight text-ink-900">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-6 text-sm text-ink-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={classNames('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-500/20 text-brand-300')}>
        {icon}
      </span>
      <span className="text-ink-300">{text}</span>
    </li>
  );
}
