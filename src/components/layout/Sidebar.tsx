'use client';

import { NavLink, useLocation } from '@/lib/router';
import { Building2, ChevronLeft, X, LogOut } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectModules, scopedPropertyIds, selectNotificationsForCurrentUser } from '@/store/selectors';
import { setSidebarOpen, toggleSidebarCollapsed } from '@/store/uiSlice';
import { signOut } from '@/store/thunks';
import { useNavigate } from '@/lib/router';
import { navForRole, type NavItem } from '@/config/nav';
import { classNames } from '@/lib/format';
import { ROLE_LABELS } from '@/config/roles';

/** All nav paths for the active role — used to resolve the most-specific active item. */
function useActiveMatcher() {
  const { pathname } = useLocation();
  return (path: string, allPaths: string[]): boolean => {
    if (pathname === path) return true;
    if (!pathname.startsWith(path + '/')) return false;
    // A deeper sibling (e.g. /payments/verification) should win over /payments.
    return !allPaths.some(
      (p) => p !== path && p.startsWith(path + '/') && (pathname === p || pathname.startsWith(p + '/')),
    );
  };
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const modules = useAppSelector(selectModules);
  const groups = user ? navForRole(user.role, modules) : [];
  const allPaths = groups.flatMap((g) => g.items.map((i) => i.path));
  const isActive = useActiveMatcher();

  const pendingVerifications = useAppSelector((s) => {
    const ids = scopedPropertyIds(s);
    return s.data.payments.filter((p) => ids.has(p.propertyId) && p.status === 'pending-verification').length;
  });
  const openMaintenance = useAppSelector((s) => {
    const ids = scopedPropertyIds(s);
    return s.data.maintenance.filter((m) => ids.has(m.propertyId) && !['verified', 'closed'].includes(m.status)).length;
  });
  const pendingInvitations = useAppSelector((s) => s.data.invitations.length);
  const unreadNotifications = useAppSelector(
    (s) => selectNotificationsForCurrentUser(s).filter((n) => !n.read).length,
  );

  const badgeFor = (item: NavItem): number | undefined => {
    if (item.badge === 'pendingVerifications') return pendingVerifications || undefined;
    if (item.badge === 'openMaintenance') return openMaintenance || undefined;
    if (item.badge === 'pendingInvitations') return pendingInvitations || undefined;
    if (item.badge === 'unreadNotifications') return unreadNotifications || undefined;
    return undefined;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={classNames('flex h-16 items-center gap-2.5 border-b border-ink-800/60 px-4', collapsed && 'justify-center px-0')}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
          <Building2 className="h-5 w-5" />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-tight text-white">EstateHub</p>
            <p className="truncate text-[11px] text-ink-400">Property Management</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">{group.title}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.path, allPaths);
                const badge = badgeFor(item);
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={classNames(
                        'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-brand-500/15 text-white'
                          : 'text-ink-300 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />}
                      <Icon className={classNames('h-[18px] w-[18px] shrink-0', active ? 'text-brand-300' : 'text-ink-400 group-hover:text-ink-200')} />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {badge !== undefined && (
                        <span
                          className={classNames(
                            'flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                            collapsed && 'absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1',
                            active ? 'bg-brand-400 text-ink-900' : 'bg-brand-500 text-white',
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-ink-800/60 p-3">
        {user && (
          <button
            onClick={() => { dispatch(signOut()); navigate('/login'); }}
            className={classNames(
              'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-300 transition-colors hover:bg-white/5 hover:text-white',
              collapsed && 'justify-center px-0',
            )}
            title="Sign out"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        )}
        {!collapsed && user && (
          <p className="mt-2 px-2.5 text-[11px] text-ink-500">
            Signed in as <span className="font-semibold text-ink-300">{ROLE_LABELS[user.role]}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.sidebarOpen);
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);

  return (
    <>
      {/* Desktop rail */}
      <aside
        data-shell="sidebar"
        className={classNames(
          'sticky top-0 hidden h-screen shrink-0 bg-ink-900 transition-[width] duration-200 lg:block',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div className="relative h-full">
          <SidebarContent collapsed={collapsed} />
          <button
            onClick={() => dispatch(toggleSidebarCollapsed())}
            className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-card hover:text-ink-800"
            aria-label="Toggle sidebar"
          >
            <ChevronLeft className={classNames('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => dispatch(setSidebarOpen(false))} />
          <aside data-shell="sidebar" className="absolute left-0 top-0 h-full w-64 bg-ink-900 shadow-pop animate-slide-in">
            <button
              onClick={() => dispatch(setSidebarOpen(false))}
              className="absolute right-3 top-4 z-10 text-ink-400 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent collapsed={false} onNavigate={() => dispatch(setSidebarOpen(false))} />
          </aside>
        </div>
      )}
    </>
  );
}
