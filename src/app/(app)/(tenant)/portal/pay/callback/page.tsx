'use client';

import { Suspense } from 'react';
import { PortalPayCallback } from '@/views/PortalPayCallback';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PortalPayCallback />
    </Suspense>
  );
}
