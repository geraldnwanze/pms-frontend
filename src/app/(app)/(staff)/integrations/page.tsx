'use client';

import { RequireRole } from '@/components/auth/guards';
import { Integrations } from '@/views/Admin';

export default function Page() {
  return (
    <RequireRole roles={['admin']}>
      <Integrations />
    </RequireRole>
  );
}
