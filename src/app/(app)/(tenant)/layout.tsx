'use client';

import type { ReactNode } from 'react';
import { RequireModule, RequireRole } from '@/components/auth/guards';
import type { Role } from '@/types';

const TENANT: Role[] = ['tenant'];

export default function TenantLayout({ children }: { children: ReactNode }) {
  return <RequireRole roles={TENANT}><RequireModule>{children}</RequireModule></RequireRole>;
}
