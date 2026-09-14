'use client';

import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/guards';
import { AppLayout } from '@/components/layout/AppLayout';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppLayout>{children}</AppLayout>
    </RequireAuth>
  );
}
