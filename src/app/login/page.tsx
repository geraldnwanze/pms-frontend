'use client';

import { LoginGate } from '@/components/auth/guards';
import { Login } from '@/views/Login';

export default function Page() {
  return (
    <LoginGate>
      <Login />
    </LoginGate>
  );
}
