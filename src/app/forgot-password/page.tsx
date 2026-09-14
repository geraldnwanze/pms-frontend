'use client';

import { LoginGate } from '@/components/auth/guards';
import { ForgotPassword } from '@/views/ForgotPassword';

export default function Page() {
  return (
    <LoginGate>
      <ForgotPassword />
    </LoginGate>
  );
}
