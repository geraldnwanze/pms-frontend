'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import {
  Menu, Search, Bell, ChevronDown, Check, Building2, DoorOpen, Users as UsersIcon,
  ReceiptText, LogOut, Settings as SettingsIcon, UserCircle2, Filter,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectCurrentUser, selectData, visiblePropertyIds, selectNotificationsForCurrentUser,
} from '@/store/selectors';
import { toggleSidebar, setPropertyFilter } from '@/store/uiSlice';
import { switchUser, signOut } from '@/store/thunks';
import { dataActions } from '@/store/dataSlice';
import { ROLE_LABELS, ROLE_COLORS } from '@/config/roles';
import { Avatar } from '@/components/ui';
import { useOnClickOutside } from '@/lib/hooks';
import { classNames, fromNow, initials } from '@/lib/format';

interface SearchHit {
  type: 'Property' | 'Unit' | 'Tenant' | 'Invoice';
  id: string;
  label: string;
  sub: string;
  to: string;
  icon: typeof Building2;
}

function GlobalSearch() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));

  const hits = useMemo<SearchHit[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2 || !user) return [];
    const ids = visiblePropertyIds(data, user);
    const out: SearchHit[] = [];
    for (const p of data.properties) {
      if (!ids.has(p.id)) continue;
      if (p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term))
        out.push({ type: 'Property', id: p.id, label: p.name, sub: `${p.code} · ${p.city}`, to: `/properties/${p.id}`, icon: Building2 });
    }
    for (const u of data.units) {
      if (!ids.has(u.propertyId)) continue;
      if (u.code.toLowerCase().includes(term) || u.type.toLowerCase().includes(term))
        out.push({ type: 'Unit', id: u.id, label: u.code, sub: u.type, to: `/units/${u.id}`, icon: DoorOpen });
    }
    const visibleTenantIds = new Set(data.leases.filter((l) => ids.has(l.propertyId)).map((l) => l.tenantId));
    for (const t of data.tenants) {
      if (!visibleTenantIds.has(t.id)) continue;
      if (t.name.toLowerCase().includes(term) || t.email.toLowerCase().includes(term) || t.phone.includes(term))
        out.push({ type: 'Tenant', id: t.id, label: t.name, sub: t.email, to: `/tenants/${t.id}`, icon: UsersIcon });
    }
    for (const inv of data.invoices) {
      if (!ids.has(inv.propertyId)) continue;
      if (inv.code.toLowerCase().includes(term))
        out.push({ type: 'Invoice', id: inv.id, label: inv.code, sub: `Invoice`, to: `/invoices/${inv.id}`, icon: ReceiptText });
    }
    return out.slice(0, 8);
  }, [q, data, user]);

  const go = (to: string) => {
    setQ('');
    setOpen(false);
    navigate(to);
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) go(hits[0].to);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search properties, units, tenants, invoices…"
        className="input h-10 pl-9"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
          {hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-500">No matches for “{q}”.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {hits.map((h) => {
                const Icon = h.icon;
                return (
                  <li key={`${h.type}-${h.id}`}>
                    <button onClick={() => go(h.to)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-50">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-800">{h.label}</span>
                        <span className="block truncate text-xs text-ink-500">{h.sub}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{h.type}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PropertyFilterMenu() {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const filter = useAppSelector((s) => s.ui.propertyFilter);
  const [open, setOpen] = useState(false);
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));

  const properties = useMemo(() => {
    if (!user) return [];
    const ids = visiblePropertyIds(data, user);
    return data.properties.filter((p) => ids.has(p.id));
  }, [data, user]);

  if (properties.length < 2) return null;
  const current = filter === 'all' ? 'All properties' : properties.find((p) => p.id === filter)?.name ?? 'All properties';

  return (
    <div ref={ref} className="relative hidden md:block">
      <button onClick={() => setOpen((o) => !o)} className="btn-secondary h-10 gap-2">
        <Filter className="h-4 w-4 text-ink-500" />
        <span className="max-w-[160px] truncate">{current}</span>
        <ChevronDown className="h-4 w-4 text-ink-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
          <ul className="max-h-80 overflow-y-auto py-1">
            <FilterRow label="All properties" active={filter === 'all'} onClick={() => { dispatch(setPropertyFilter('all')); setOpen(false); }} />
            {properties.map((p) => (
              <FilterRow key={p.id} label={p.name} sub={p.code} active={filter === p.id} onClick={() => { dispatch(setPropertyFilter(p.id)); setOpen(false); }} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-ink-50">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink-800">{label}</span>
          {sub && <span className="block truncate text-xs text-ink-400">{sub}</span>}
        </span>
        {active && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
      </button>
    </li>
  );
}

function NotificationBell() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const notifications = useAppSelector(selectNotificationsForCurrentUser);
  const [open, setOpen] = useState(false);
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));

  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop sm:w-96">
          <div className="flex items-center justify-between border-b border-ink-200/70 px-4 py-3">
            <p className="text-sm font-bold text-ink-800">Notifications</p>
            {unread > 0 && user && (
              <button onClick={() => dispatch(dataActions.markAllNotificationsRead({ userId: user.id, role: user.role }))} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Mark all read
              </button>
            )}
          </div>
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">You’re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {sorted.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      dispatch(dataActions.markNotificationRead(n.id));
                      setOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                    className={classNames('flex w-full gap-3 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50', !n.read && 'bg-brand-50/40')}
                  >
                    <span className={classNames('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-500')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-800">{n.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-ink-400">{fromNow(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => { setOpen(false); navigate('/notifications'); }}
            className="block w-full border-t border-ink-200/70 px-4 py-2.5 text-center text-xs font-semibold text-brand-600 hover:bg-ink-50"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const users = useAppSelector((s) => s.data.users);
  const [open, setOpen] = useState(false);
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));
  if (!user) return null;

  const others = users.filter((u) => u.id !== user.id);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-ink-100">
        <Avatar name={user.name} color={user.avatarColor} size={34} />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-bold leading-tight text-ink-800">{user.name}</span>
          <span className="block text-[11px] leading-tight text-ink-500">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
          <div className="flex items-center gap-3 border-b border-ink-200/70 px-4 py-3">
            <Avatar name={user.name} color={user.avatarColor} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-800">{user.name}</p>
              <p className="truncate text-xs text-ink-500">{user.email}</p>
            </div>
          </div>
          <div className="py-1">
            <MenuLink icon={<UserCircle2 className="h-4 w-4" />} label="Profile & preferences" onClick={() => { setOpen(false); navigate('/settings'); }} />
            <MenuLink icon={<SettingsIcon className="h-4 w-4" />} label="Settings" onClick={() => { setOpen(false); navigate('/settings'); }} />
          </div>
          <div className="border-t border-ink-200/70">
            <p className="px-4 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">Switch account (demo)</p>
            <ul className="max-h-56 overflow-y-auto pb-1">
              {others.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={async () => {
                      setOpen(false);
                      const switched = await dispatch(switchUser(u.id));
                      if (switched) navigate(switched.role === 'tenant' ? '/portal' : '/dashboard');
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left hover:bg-ink-50"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: u.avatarColor }}>
                      {initials(u.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-800">{u.name}</span>
                      <span className="block truncate text-[11px] text-ink-500">{ROLE_LABELS[u.role]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-ink-200/70 py-1">
            <MenuLink icon={<LogOut className="h-4 w-4" />} label="Sign out" onClick={() => { setOpen(false); dispatch(signOut()); navigate('/login'); }} danger />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={classNames('flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-medium hover:bg-ink-50', danger ? 'text-red-600' : 'text-ink-700')}>
      {icon}
      {label}
    </button>
  );
}

export function Topbar() {
  const dispatch = useAppDispatch();
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button onClick={() => dispatch(toggleSidebar())} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex flex-1 items-center gap-3">
        <GlobalSearch />
      </div>
      <PropertyFilterMenu />
      <NotificationBell />
      <div className="h-6 w-px bg-ink-200" />
      <UserMenu />
    </header>
  );
}
