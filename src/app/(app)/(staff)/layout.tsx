'use client';

import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/guards';
import type { Role } from '@/types';

const STAFF: Role[] = ['admin', 'owner', 'manager', 'agent', 'finance', 'maintenance', 'user'];

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <RequireRole roles={STAFF}>{children}</RequireRole>;
}
