'use client';

import { RequireRole } from '@/components/auth/guards';
import { Modules } from '@/views/Modules';

export default function Page() {
  return (
    <RequireRole roles={['superadmin']}>
      <Modules />
    </RequireRole>
  );
}
