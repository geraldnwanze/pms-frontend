'use client';

import { RequireRole } from '@/components/auth/guards';
import { UsersRoles } from '@/views/Admin';

export default function Page() {
  return (
    <RequireRole roles={['admin']}>
      <UsersRoles />
    </RequireRole>
  );
}
