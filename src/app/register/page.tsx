'use client';

import { LoginGate } from '@/components/auth/guards';
import { Register } from '@/views/Register';

export default function Page() {
  return (
    <LoginGate>
      <Register />
    </LoginGate>
  );
}
