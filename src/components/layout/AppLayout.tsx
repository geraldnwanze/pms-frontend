'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastHost } from './ToastHost';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

export function AppLayout({ children }: { children: ReactNode }) {
  useRealtimeNotifications();
  return (
    <div className="flex min-h-screen bg-ink-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
