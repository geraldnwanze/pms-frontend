'use client';

import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/guards';
import type { Role } from '@/types';

const TENANT: Role[] = ['tenant'];

export default function TenantLayout({ children }: { children: ReactNode }) {
  return <RequireRole roles={TENANT}>{children}</RequireRole>;
}
