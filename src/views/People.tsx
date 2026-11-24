'use client';

import { useMemo } from 'react';
import { Users, Building2, Wallet, Phone, Mail, Shield, MapPin } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser } from '@/store/selectors';
import {
  PageHeader, Card, StatCard, Badge, Money, Avatar, EmptyState, ExportMenu,
} from '@/components/ui';
import { ROLE_LABELS, ROLE_COLORS, isAdminRole } from '@/config/roles';
import type { Role, User } from '@/types';

// ===========================================================================
// Owners
// ===========================================================================
export function Owners() {
  const data = useAppSelector(selectData);

  const owners = useMemo(() => data.users.filter((u) => u.role === 'owner').slice().sort((a, b) => a.name.localeCompare(b.name)), [data.users]);

  const portfolio = (ownerId: string) => {
    const props = data.properties.filter((p) => p.owners.some((o) => o.ownerId === ownerId));
    const units = data.units.filter((u) => props.some((p) => p.id === u.propertyId));
    const value = props.reduce((s, p) => {
      const stake = p.owners.find((o) => o.ownerId === ownerId)?.percentage ?? 0;
      return s + (p.estimatedValue ?? 0) * (stake / 100);
    }, 0);
    return { props, units, value };
  };

  const totalValue = owners.reduce((s, o) => s + portfolio(o.id).value, 0);

  const exportRows = owners.map((o) => {
    const p = portfolio(o.id);
    return { Owner: o.name, Email: o.email, Phone: o.phone ?? '', Properties: p.props.length, Units: p.units.length, 'Portfolio value': Math.round(p.value) };
  });

  return (
    <div>
      <PageHeader title="Owners" subtitle="Landlords and their portfolios"
        actions={<ExportMenu filename="owners" title="Property owners" rows={exportRows} size="md" />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Owners" value={owners.length} icon={<Users className="h-5 w-5" />} tone="green" />
        <StatCard label="Properties owned" value={data.properties.length} icon={<Building2 className="h-5 w-5" />} tone="blue" />
        <StatCard label="Combined value" value={<Money value={totalValue} compact />} icon={<Wallet className="h-5 w-5" />} tone="purple" />
      </div>

      {owners.length === 0 ? (
        <Card><EmptyState icon={<Users className="h-6 w-6" />} title="No owners on file" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {owners.map((o) => {
            const p = portfolio(o.id);
            return (
              <Card key={o.id}>
                <div className="flex items-center gap-3">
                  <Avatar name={o.name} color={o.avatarColor} size={44} />
                  <div className="min-w-0"><p className="truncate font-semibold text-ink-800">{o.name}</p><p className="truncate text-xs text-ink-400">{o.title ?? 'Property Owner'}</p></div>
                </div>
                <div className="mt-4 space-y-1.5 text-sm">
                  {o.phone && <p className="flex items-center gap-2 text-ink-500"><Phone className="h-3.5 w-3.5 text-ink-300" />{o.phone}</p>}
                  <p className="flex items-center gap-2 truncate text-ink-500"><Mail className="h-3.5 w-3.5 text-ink-300" />{o.email}</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-center">
                  <div><p className="text-lg font-bold text-ink-800">{p.props.length}</p><p className="text-[11px] uppercase tracking-wide text-ink-400">Props</p></div>
                  <div><p className="text-lg font-bold text-ink-800">{p.units.length}</p><p className="text-[11px] uppercase tracking-wide text-ink-400">Units</p></div>
                  <div><Money value={p.value} compact className="text-lg font-bold text-brand-600" /><p className="text-[11px] uppercase tracking-wide text-ink-400">Value</p></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Staff
// ===========================================================================
const STAFF_ROLES: Role[] = ['superadmin', 'admin', 'manager', 'agent', 'finance', 'maintenance'];

export function Staff() {
  const data = useAppSelector(selectData);
  const me = useAppSelector(selectCurrentUser);

  const staff = useMemo(
    () => data.users.filter((u) => STAFF_ROLES.includes(u.role)).slice().sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role) || a.name.localeCompare(b.name)),
    [data.users],
  );

  const assignedProps = (u: User) => {
    if (isAdminRole(u.role)) return data.properties;
    const ids = new Set(u.assignedPropertyIds ?? []);
    if (ids.size) return data.properties.filter((p) => ids.has(p.id));
    // managers referenced on the property record
    return data.properties.filter((p) => p.managerId === u.id || p.assignedStaffIds?.includes(u.id));
  };

  const byRole = useMemo(() => {
    const m: Record<string, User[]> = {};
    staff.forEach((u) => { (m[u.role] ??= []).push(u); });
    return m;
  }, [staff]);

  const exportRows = staff.map((u) => ({ Name: u.name, Role: ROLE_LABELS[u.role], Email: u.email, Phone: u.phone ?? '', Properties: assignedProps(u).length, Status: u.status }));

  return (
    <div>
      <PageHeader title="Staff" subtitle="Your operational team"
        actions={<ExportMenu filename="staff" title="Staff directory" rows={exportRows} size="md" />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Team members" value={staff.length} icon={<Users className="h-5 w-5" />} tone="blue" />
        <StatCard label="Managers" value={byRole['manager']?.length ?? 0} icon={<Shield className="h-5 w-5" />} tone="cyan" />
        <StatCard label="Agents" value={byRole['agent']?.length ?? 0} icon={<MapPin className="h-5 w-5" />} tone="amber" />
        <StatCard label="Technicians" value={byRole['maintenance']?.length ?? 0} icon={<Building2 className="h-5 w-5" />} tone="purple" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((u) => {
          const props = assignedProps(u);
          return (
            <Card key={u.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} color={u.avatarColor} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-800">{u.name}{u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-brand-500">(you)</span>}</p>
                    <p className="truncate text-xs text-ink-400">{u.title ?? ROLE_LABELS[u.role]}</p>
                  </div>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${ROLE_COLORS[u.role]}1a`, color: ROLE_COLORS[u.role] }}>{ROLE_LABELS[u.role]}</span>
              </div>
              <div className="mt-4 space-y-1.5 text-sm">
                {u.phone && <p className="flex items-center gap-2 text-ink-500"><Phone className="h-3.5 w-3.5 text-ink-300" />{u.phone}</p>}
                <p className="flex items-center gap-2 truncate text-ink-500"><Mail className="h-3.5 w-3.5 text-ink-300" />{u.email}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="text-sm text-ink-500">{isAdminRole(u.role) ? 'All properties' : `${props.length} ${props.length === 1 ? 'property' : 'properties'}`}</span>
                {u.status !== 'active' ? <Badge tone="amber">{u.status}</Badge> : <Badge tone="green" dot>Active</Badge>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
