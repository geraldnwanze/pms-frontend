'use client';

import { RequireRole } from '@/components/auth/guards';
import { AuditLogs } from '@/views/Admin';

export default function Page() {
  return (
    <RequireRole roles={['admin', 'finance']}>
      <AuditLogs />
    </RequireRole>
  );
}
