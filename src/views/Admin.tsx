'use client';

import { useMemo, useState } from 'react';
import {
  Users, ShieldCheck, Check, Minus, Pencil, ScrollText, Activity, CreditCard, Download,
  Plug, MessageSquare, Mail, Calculator, PenTool, Landmark, CalendarDays, Copy,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { saveIntegrations } from '@/store/thunks';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, SectionCard, StatCard, Badge, Avatar, DataTable, type Column,
  Tabs, Modal, Field, Select, EmptyState, ExportMenu,
} from '@/components/ui';
import { ROLE_LABELS, ROLE_COLORS, ROLE_PERMISSIONS, PERMISSION_LABELS, ALL_ROLES, can, isAdminRole } from '@/config/roles';
import { formatDateTime, fromNow, uid, classNames } from '@/lib/format';
import type { Tone } from '@/lib/status';
import type { User, Role, Permission, AuditLog, AuditAction } from '@/types';

const tc = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ===========================================================================
// Users & Roles
// ===========================================================================
const STATUS_TONE: Record<User['status'], Tone> = { active: 'green', inactive: 'gray', invited: 'amber' };

export function UsersRoles() {
  const data = useAppSelector(selectData);
  const me = useAppSelector(selectCurrentUser);
  const [tab, setTab] = useState('users');
  const [editing, setEditing] = useState<User | null>(null);
  const canManage = can(me?.role, 'manage_users');

  const users = useMemo(
    () => data.users.slice().sort((a, b) => ALL_ROLES.indexOf(a.role) - ALL_ROLES.indexOf(b.role) || a.name.localeCompare(b.name)),
    [data.users],
  );

  const scopeLabel = (u: User): string => {
    if (isAdminRole(u.role)) return 'All properties';
    if (u.role === 'owner') return `${data.properties.filter((p) => p.owners.some((o) => o.ownerId === u.id)).length} owned`;
    if (u.role === 'tenant') return u.tenantId ? 'Own unit' : '—';
    const ids = new Set(u.assignedPropertyIds ?? []);
    const n = ids.size || data.properties.filter((p) => p.managerId === u.id || p.assignedStaffIds?.includes(u.id)).length;
    return `${n} ${n === 1 ? 'property' : 'properties'}`;
  };

  const activeCount = users.filter((u) => u.status === 'active').length;
  const twoFACount = users.filter((u) => u.twoFactorEnabled).length;

  const exportRows = users.map((u) => ({
    Name: u.name, Role: ROLE_LABELS[u.role], Email: u.email, Phone: u.phone ?? '',
    Scope: scopeLabel(u), TwoFactor: u.twoFactorEnabled ? 'On' : 'Off', Status: tc(u.status),
    LastLogin: u.lastLoginAt ?? '—',
  }));

  const columns: Column<User>[] = [
    { key: 'user', header: 'User', sortValue: (u) => u.name, render: (u) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={u.name} color={u.avatarColor} size={38} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-800">{u.name}{u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-brand-500">(you)</span>}</p>
          <p className="truncate text-xs text-ink-400">{u.email}</p>
        </div>
      </div>
    ) },
    { key: 'role', header: 'Role', sortValue: (u) => u.role, render: (u) => (
      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${ROLE_COLORS[u.role]}1a`, color: ROLE_COLORS[u.role] }}>{ROLE_LABELS[u.role]}</span>
    ) },
    { key: 'scope', header: 'Scope', render: (u) => <span className="text-sm text-ink-600">{scopeLabel(u)}</span> },
    { key: '2fa', header: '2FA', align: 'center', render: (u) => u.twoFactorEnabled ? <Badge tone="green">On</Badge> : <Badge tone="gray">Off</Badge> },
    // Below `lg` the table is narrower than its card, so drop the least useful column and keep the edit button where it can be reached.
    { key: 'login', header: 'Last login', className: 'hidden lg:table-cell', headerClassName: 'hidden lg:table-cell', sortValue: (u) => u.lastLoginAt ?? '', render: (u) => <span className="text-sm text-ink-500">{u.lastLoginAt ? fromNow(u.lastLoginAt) : 'Never'}</span> },
    { key: 'status', header: 'Status', sortValue: (u) => u.status, render: (u) => <Badge tone={STATUS_TONE[u.status]} dot={u.status === 'active'}>{tc(u.status)}</Badge> },
    // A superadmin account can only be edited by a superadmin (an admin could otherwise set its password and sign in as it).
    { key: 'actions', header: '', align: 'right', className: 'sticky right-0 bg-white', headerClassName: 'sticky right-0 bg-ink-50', render: (u) => canManage && (u.role !== 'superadmin' || me?.role === 'superadmin') ? (
      <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600" title="Edit user" onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></button>
    ) : null },
  ];

  return (
    <div>
      <PageHeader title="Users & Roles" subtitle="Team accounts, access levels and the permission matrix"
        actions={<ExportMenu filename="users" title="User accounts" rows={exportRows} size="md" />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total users" value={users.length} icon={<Users className="h-5 w-5" />} tone="blue" />
        <StatCard label="Active" value={activeCount} icon={<ShieldCheck className="h-5 w-5" />} tone="green" />
        <StatCard label="Roles" value={ALL_ROLES.length} icon={<ShieldCheck className="h-5 w-5" />} tone="purple" />
        <StatCard label="2FA enabled" value={`${twoFACount}/${users.length}`} icon={<ShieldCheck className="h-5 w-5" />} tone="amber" />
      </div>

      <Tabs className="mb-4" active={tab} onChange={setTab} tabs={[
        { key: 'users', label: 'Users', count: users.length },
        { key: 'roles', label: 'Roles & permissions', count: ALL_ROLES.length },
      ]} />

      {tab === 'users' ? (
        <Card padded={false}>
          <DataTable columns={columns} rows={users} keyOf={(u) => u.id}
            searchable searchAccessor={(u) => `${u.name} ${u.email} ${ROLE_LABELS[u.role]}`} searchPlaceholder="Search users…"
            initialSort={{ key: 'user', dir: 'asc' }} emptyTitle="No users" />
        </Card>
      ) : (
        <SectionCard title="Permission matrix" subtitle="What each role can do across the system" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200/70">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="th sticky left-0 bg-ink-50/60">Permission</th>
                  {ALL_ROLES.map((r) => {
                    const count = data.users.filter((u) => u.role === r).length;
                    return (
                      <th key={r} className="th text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: ROLE_COLORS[r] }} />
                          <span className="whitespace-nowrap">{ROLE_LABELS[r]}</span>
                          <span className="text-[10px] font-normal normal-case text-ink-400">{count} {count === 1 ? 'user' : 'users'}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200/60 bg-white">
                {(Object.keys(PERMISSION_LABELS) as Permission[]).map((perm) => (
                  <tr key={perm} className="hover:bg-ink-50/40">
                    <td className="td sticky left-0 bg-white font-medium text-ink-700">{PERMISSION_LABELS[perm]}</td>
                    {ALL_ROLES.map((r) => (
                      <td key={r} className="td text-center">
                        {ROLE_PERMISSIONS[r].includes(perm)
                          ? <Check className="mx-auto h-4 w-4 text-brand-600" />
                          : <Minus className="mx-auto h-4 w-4 text-ink-300" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {editing && <EditUserModal user={editing} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditUserModal({ user, isSelf, onClose }: { user: User; isSelf: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectCurrentUser);
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState<User['status']>(user.status);
  const [twoFA, setTwoFA] = useState(user.twoFactorEnabled);
  // A superadmin's role and status are changed on the server (php artisan pms:make-superadmin), never from this screen.
  const managedOnServer = user.role === 'superadmin';
  const lockRoleAndStatus = isSelf || managedOnServer;

  const save = () => {
    const changes: Partial<User> = {};
    if (role !== user.role) changes.role = role;
    if (status !== user.status) changes.status = status;
    if (twoFA !== user.twoFactorEnabled) changes.twoFactorEnabled = twoFA;
    if (Object.keys(changes).length === 0) { onClose(); return; }
    dispatch(dataActions.updateUser({ id: user.id, changes, actorId: me!.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${user.name} updated.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Edit user" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save changes</button></>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-ink-50 px-4 py-3">
          <Avatar name={user.name} color={user.avatarColor} size={44} />
          <div className="min-w-0"><p className="truncate font-semibold text-ink-800">{user.name}</p><p className="truncate text-xs text-ink-500">{user.email}</p></div>
        </div>
        {managedOnServer
          ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">A superadmin's role and status are managed from the command line (<code>php artisan pms:make-superadmin</code>), not here.</p>
          : isSelf && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">You can't change your own role or status — ask another administrator.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role"><Select value={role} disabled={lockRoleAndStatus} onChange={(e) => setRole(e.target.value as Role)}>{(managedOnServer ? ['superadmin' as Role, ...ALL_ROLES] : ALL_ROLES).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
          <Field label="Status"><Select value={status} disabled={lockRoleAndStatus} onChange={(e) => setStatus(e.target.value as User['status'])}>{(['active', 'inactive', 'invited'] as const).map((s) => <option key={s} value={s}>{tc(s)}</option>)}</Select></Field>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3">
          <div><p className="text-sm font-semibold text-ink-800">Two-factor authentication</p><p className="text-xs text-ink-500">Require a one-time code at sign-in.</p></div>
          <Toggle on={twoFA} onChange={setTwoFA} />
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Audit Logs
// ===========================================================================
const ACTION_TONE: Record<AuditAction, Tone> = {
  login: 'gray', logout: 'gray', create: 'green', edit: 'blue', delete: 'red',
  approve: 'green', reject: 'red', 'payment-submit': 'amber', 'payment-approve': 'green',
  'payment-reject': 'red', refund: 'amber', 'permission-change': 'purple',
  'document-access': 'cyan', export: 'indigo',
};

export function AuditLogs() {
  const data = useAppSelector(selectData);
  const me = useAppSelector(selectCurrentUser);
  const [action, setAction] = useState<AuditAction | 'all'>('all');
  const canExport = can(me?.role, 'export');

  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? id;
  const userColor = (id: string) => data.users.find((u) => u.id === id)?.avatarColor ?? '#64748b';

  const actionsPresent = useMemo(
    () => [...new Set(data.audit.map((a) => a.action))].sort() as AuditAction[],
    [data.audit],
  );
  const rows = useMemo(
    () => (action === 'all' ? data.audit : data.audit.filter((a) => a.action === action)),
    [data.audit, action],
  );

  const paymentActions = data.audit.filter((a) => a.action.startsWith('payment') || a.action === 'refund').length;
  const exports = data.audit.filter((a) => a.action === 'export').length;
  const uniqueUsers = new Set(data.audit.map((a) => a.userId)).size;

  const exportRows = rows.map((a) => ({
    Time: a.timestamp, User: userName(a.userId), Action: tc(a.action), Entity: a.entity,
    Summary: a.summary, IP: a.ip ?? '', Device: a.device ?? '',
  }));

  const columns: Column<AuditLog>[] = [
    { key: 'time', header: 'When', sortValue: (a) => a.timestamp, render: (a) => (
      <div><p className="text-sm text-ink-700">{formatDateTime(a.timestamp)}</p><p className="text-xs text-ink-400">{fromNow(a.timestamp)}</p></div>
    ) },
    { key: 'user', header: 'User', sortValue: (a) => userName(a.userId), render: (a) => (
      <div className="flex items-center gap-2"><Avatar name={userName(a.userId)} color={userColor(a.userId)} size={30} /><span className="text-sm font-medium text-ink-700">{userName(a.userId)}</span></div>
    ) },
    { key: 'action', header: 'Action', sortValue: (a) => a.action, render: (a) => <Badge tone={ACTION_TONE[a.action]}>{tc(a.action)}</Badge> },
    { key: 'entity', header: 'Entity', sortValue: (a) => a.entity, render: (a) => <span className="text-sm text-ink-600">{a.entity}</span> },
    { key: 'summary', header: 'Details', render: (a) => <span className="text-sm text-ink-600">{a.summary}</span> },
    { key: 'source', header: 'Source', render: (a) => <div className="text-xs text-ink-400"><p>{a.ip}</p><p>{a.device}</p></div> },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Immutable trail of every action across the system"
        actions={canExport ? <ExportMenu filename="audit-log" title="Audit trail" rows={exportRows} size="md" /> : undefined} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total events" value={data.audit.length} icon={<Activity className="h-5 w-5" />} tone="blue" />
        <StatCard label="Payment actions" value={paymentActions} icon={<CreditCard className="h-5 w-5" />} tone="green" />
        <StatCard label="Exports" value={exports} icon={<Download className="h-5 w-5" />} tone="indigo" />
        <StatCard label="Active users" value={uniqueUsers} icon={<Users className="h-5 w-5" />} tone="purple" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-ink-500">Action</label>
        <Select value={action} onChange={(e) => setAction(e.target.value as AuditAction | 'all')} className="max-w-[220px]">
          <option value="all">All actions</option>
          {actionsPresent.map((a) => <option key={a} value={a}>{tc(a)}</option>)}
        </Select>
        {action !== 'all' && <Badge tone="gray">{rows.length} shown</Badge>}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(a) => a.id}
          searchable searchAccessor={(a) => `${userName(a.userId)} ${a.action} ${a.entity} ${a.summary}`} searchPlaceholder="Search the audit trail…"
          initialSort={{ key: 'time', dir: 'desc' }} emptyTitle="No matching events" />
      </Card>
    </div>
  );
}

// ===========================================================================
// Integrations
// ===========================================================================
interface Integration { key: string; name: string; category: string; desc: string; icon: React.ReactNode; on: boolean }
const INTEGRATIONS: Integration[] = [
  { key: 'paystack', name: 'Paystack', category: 'Payments', desc: 'Accept card, USSD & bank transfers and auto-reconcile receipts.', icon: <CreditCard className="h-5 w-5" />, on: true },
  { key: 'flutterwave', name: 'Flutterwave', category: 'Payments', desc: 'Alternative gateway for cards and mobile money.', icon: <CreditCard className="h-5 w-5" />, on: false },
  { key: 'remita', name: 'Remita', category: 'Payments', desc: 'Bank collections, standing orders and split payments.', icon: <Landmark className="h-5 w-5" />, on: false },
  { key: 'termii', name: 'Termii SMS', category: 'Messaging', desc: 'Send rent reminders and one-time passcodes by SMS.', icon: <MessageSquare className="h-5 w-5" />, on: true },
  { key: 'sendgrid', name: 'SendGrid', category: 'Messaging', desc: 'Transactional email for invoices, receipts and notices.', icon: <Mail className="h-5 w-5" />, on: true },
  { key: 'quickbooks', name: 'QuickBooks', category: 'Accounting', desc: 'Sync invoices and expenses to your general ledger.', icon: <Calculator className="h-5 w-5" />, on: false },
  { key: 'docusign', name: 'DocuSign', category: 'Documents', desc: 'Collect e-signatures on leases and agreements.', icon: <PenTool className="h-5 w-5" />, on: false },
  { key: 'gcal', name: 'Google Calendar', category: 'Productivity', desc: 'Push inspections and viewings to team calendars.', icon: <CalendarDays className="h-5 w-5" />, on: false },
];

export function Integrations() {
  const me = useAppSelector(selectCurrentUser);
  const stored = useAppSelector((s) => s.data.integrations);
  const dispatch = useAppDispatch();
  const isAdmin = isAdminRole(me?.role);
  const [pending, setPending] = useState<string | null>(null);

  const state: Record<string, boolean> = Object.fromEntries(
    INTEGRATIONS.map((i) => [i.key, stored[i.key]?.enabled ?? i.on]),
  );

  const toggle = async (i: Integration) => {
    if (!isAdmin) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Only administrators can change integrations.' })); return; }
    if (pending) return;
    const next = !state[i.key];
    setPending(i.key);
    const ok = await dispatch(saveIntegrations({ [i.key]: { enabled: next, label: i.name, category: i.category } }));
    if (ok) dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${i.name} ${next ? 'connected' : 'disconnected'}.` }));
    setPending(null);
  };

  const copyKey = () => {
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'API key copied to clipboard.' }));
  };

  const connected = Object.values(state).filter(Boolean).length;
  const categories = [...new Set(INTEGRATIONS.map((i) => i.category))];

  return (
    <div>
      <PageHeader title="Integrations" subtitle="Connect payment gateways, messaging and accounting tools" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Connected" value={connected} icon={<Plug className="h-5 w-5" />} tone="green" />
        <StatCard label="Available" value={INTEGRATIONS.length} icon={<Plug className="h-5 w-5" />} tone="blue" />
        <StatCard label="Categories" value={categories.length} icon={<Plug className="h-5 w-5" />} tone="purple" />
      </div>

      {!isAdmin && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">You have read-only access — only administrators can connect or disconnect integrations.</div>
      )}

      {categories.map((cat) => (
        <div key={cat} className="mb-6">
          <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">{cat}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.filter((i) => i.category === cat).map((i) => {
              const on = state[i.key];
              return (
                <Card key={i.key} className={classNames('transition-colors', on && 'ring-1 ring-brand-200')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={classNames('flex h-11 w-11 items-center justify-center rounded-xl', on ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400')}>{i.icon}</span>
                      <div>
                        <p className="font-semibold text-ink-800">{i.name}</p>
                        {on ? <Badge tone="green" dot>Connected</Badge> : <Badge tone="gray">Not connected</Badge>}
                      </div>
                    </div>
                    <Toggle on={on} onChange={() => toggle(i)} disabled={!isAdmin || pending !== null} />
                  </div>
                  <p className="mt-3 text-sm text-ink-500">{i.desc}</p>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      <SectionCard title="API & webhooks" subtitle="Programmatic access for your own systems">
        <div className="space-y-4">
          <Field label="Live API key">
            <div className="flex items-center gap-2">
              <input readOnly value="pk_live_•••••••••••••••• 4e9a" className="input font-mono text-sm" />
              <button className="btn-secondary shrink-0" onClick={copyKey}><Copy className="h-4 w-4" /> Copy</button>
            </div>
          </Field>
          <Field label="Webhook URL" hint="We POST payment and lease events here.">
            <input readOnly value="https://api.pms.example/webhooks/inbound" className="input font-mono text-sm" />
          </Field>
        </div>
      </SectionCard>

      {INTEGRATIONS.length === 0 && <Card><EmptyState icon={<Plug className="h-6 w-6" />} title="No integrations available" /></Card>}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!on)}
      className={classNames('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', on ? 'bg-brand-600' : 'bg-ink-300', disabled && 'cursor-not-allowed opacity-50')}>
      <span className={classNames('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}
