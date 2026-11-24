import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';

vi.mock('./Sidebar', () => ({ Sidebar: () => <nav>sidebar</nav> }));
vi.mock('./Topbar', () => ({ Topbar: () => <header>topbar</header> }));
vi.mock('./EmailVerificationBanner', () => ({ EmailVerificationBanner: () => null }));
vi.mock('@/hooks/useRealtimeNotifications', () => ({ useRealtimeNotifications: vi.fn() }));
vi.mock('@/hooks/useModuleSync', () => ({ useModuleSync: vi.fn() }));
import { useModuleSync } from '@/hooks/useModuleSync';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

describe('AppLayout', () => {
  it('keeps the signed-in app current: live notifications, and a module check when the tab regains focus', () => {
    render(<AppLayout><p>page</p></AppLayout>);

    expect(screen.getByText('page')).toBeInTheDocument();
    expect(useRealtimeNotifications).toHaveBeenCalled();
    expect(useModuleSync).toHaveBeenCalled();
  });
});
