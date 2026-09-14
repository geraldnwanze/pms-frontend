'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Unknown routes fall back to the app root (which redirects by role). */
export default function NotFound() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
