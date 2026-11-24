'use client';

import type { ReactNode } from 'react';
import { RequireModule, RequireRole } from '@/components/auth/guards';
import type { Role } from '@/types';

const STAFF: Role[] = ['superadmin', 'admin', 'owner', 'manager', 'agent', 'finance', 'maintenance', 'user'];

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <RequireRole roles={STAFF}><RequireModule>{children}</RequireModule></RequireRole>;
}
