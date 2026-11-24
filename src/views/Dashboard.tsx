'use client';

import { useEffect, useMemo } from 'react';
import { useNavigate } from '@/lib/router';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Building2, DoorOpen, Wallet, TrendingUp, AlertTriangle, BadgeCheck, Wrench,
  ArrowUpRight, CalendarClock, ReceiptText, Banknote, Home, Users, FileText,
  ClipboardList, Flame, KeyRound, UserPlus, CheckCircle2, Clock, Target, Megaphone,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds, computeKpis, propertyPerformance, selectNotificationsForCurrentUser, selectDashboard, isOverdue, isLeaseExpiring, selectModuleOn } from '@/store/selectors';
import { fetchDashboard } from '@/store/thunks';
import { StatCard, SectionCard, PageHeader, Money, ProgressBar, StatusBadge, Badge, EmptyState } from '@/components/ui';
import {
  invoiceStatusMeta, leaseStatusMeta, maintenanceStatusMeta, urgencyMeta, leadStatusMeta, expenseStatusMeta,
  payoutStatusMeta,
} from '@/lib/status';
import { formatCurrency, formatPercent, formatDate, daysUntil, classNames, today } from '@/lib/format';
import { ROLE_LABELS, isAdminRole } from '@/config/roles';
import type { DashboardData, DashboardKpis, DashboardPersona, Role } from '@/types';

const DONUT = {
  occupied: '#059669',
  vacant: '#3b82f6',
  reserved: '#8b5cf6',
  maintenance: '#f59e0b',
  renovation: '#f97316',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function personaFromRole(role?: Role): DashboardPersona {
  switch (role) {
    case 'finance': return 'finance';
    case 'manager': return 'operations';
    case 'agent': return 'leasing';
    case 'maintenance': return 'maintenance';
    case 'user': return 'newcomer';
    default: return 'portfolio';
  }
}

// ===========================================================================
// Entry point — picks the persona layout the server tailored the payload for.
// ===========================================================================
export function Dashboard() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const dash = useAppSelector(selectDashboard);
  const propertyFilter = useAppSelector((s) => s.ui.propertyFilter);

  // The dashboard is server-computed (GET /api/v1/dashboard). Re-pull it when the
  // global property filter changes; `bootstrap()` refreshes it after mutations.
  useEffect(() => {
    void dispatch(fetchDashboard());
  }, [dispatch, propertyFilter]);

  const persona = dash?.persona ?? personaFromRole(user?.role);
  const leasingOn = useAppSelector(selectModuleOn('leasing'));
  const maintenanceOn = useAppSelector(selectModuleOn('maintenance'));

  return (
    <div>
      <DashHeader />
      {persona === 'finance' && <FinanceDashboard dash={dash} />}
      {persona === 'operations' && <OperationsDashboard dash={dash} />}
      {persona === 'leasing' && (leasingOn ? <LeasingDashboard dash={dash} /> : <ModuleOffNotice name="Leasing & leads" />)}
      {persona === 'maintenance' && (maintenanceOn ? <MaintenanceDashboard dash={dash} /> : <ModuleOffNotice name="Maintenance" />)}
      {persona === 'newcomer' && <NewcomerDashboard />}
      {persona === 'portfolio' && <PortfolioDashboard dash={dash} />}
    </div>
  );
}

// ===========================================================================
// Shared bits
// ===========================================================================
function DashHeader() {
  const user = useAppSelector(selectCurrentUser);
  const notifications = useAppSelector(selectNotificationsForCurrentUser);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <PageHeader
      title={`${greeting()}, ${user?.name.split(' ')[0] ?? ''}`}
      subtitle={
        <span className="flex items-center gap-2">
          <Badge tone="green" dot>{ROLE_LABELS[user?.role ?? 'admin']}</Badge>
          <span className="text-ink-400">·</span>
          <span>{formatDate(today())}</span>
          {unread > 0 && (
            <>
              <span className="text-ink-400">·</span>
              <span>{unread} unread notification{unread > 1 ? 's' : ''}</span>
            </>
          )}
        </span>
      }
    />
  );
}

function DashLoading() {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-ink-300 py-20 text-sm text-ink-500">
      Loading your dashboard…
    </div>
  );
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

type Col = string | { label: string; right?: boolean };
function DataGrid({ head, children }: { head: Col[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-ink-200/70">
        <thead className="bg-ink-50/60">
          <tr>
            {head.map((c) => {
              const label = typeof c === 'string' ? c : c.label;
              const right = typeof c !== 'string' && c.right;
              return <th key={label} className={classNames('th', right && 'text-right')}>{label}</th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200/60 bg-white">{children}</tbody>
      </table>
    </div>
  );
}

function RentTrendCard({ dash, className }: { dash: DashboardData; className?: string }) {
  const monthly = useMemo(
    () => dash.rentTrend.map((r) => ({
      label: dayjs(`${r.month}-01`).format('MMM YY'),
      expected: r.billed,
      collected: r.collected,
    })),
    [dash.rentTrend],
  );
  return (
    <SectionCard title="Rent collection trend" subtitle="Billed vs collected by month" className={className} bodyClassName="p-3">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthly} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="gExpected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => formatCurrency(v, { compact: true })} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={54} />
            <Tooltip
              formatter={(v: number, name) => [formatCurrency(v), name === 'expected' ? 'Billed' : 'Collected']}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
            />
            <Area type="monotone" dataKey="expected" stroke="#94a3b8" strokeWidth={2} fill="url(#gExpected)" name="expected" />
            <Area type="monotone" dataKey="collected" stroke="#059669" strokeWidth={2.5} fill="url(#gCollected)" name="collected" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function UnitStatusCard({ kpis }: { kpis: DashboardKpis }) {
  const donutData = [
    { name: 'Occupied', value: kpis.occupied, color: DONUT.occupied },
    { name: 'Vacant', value: kpis.vacant, color: DONUT.vacant },
    { name: 'Reserved', value: kpis.reserved, color: DONUT.reserved },
    { name: 'Maintenance', value: kpis.maintenance + kpis.underRenovation, color: DONUT.maintenance },
  ].filter((d) => d.value > 0);
  return (
    <SectionCard title="Unit status" subtitle={`${kpis.totalUnits} units total`} bodyClassName="p-3">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={2} stroke="none">
              {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v: number, n) => [`${v} units`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

/** Horizontal count-bar list (lead funnel, maintenance status breakdown, …). */
function BreakdownBars({ rows }: { rows: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-xs font-medium capitalize text-ink-600">{r.label.replace(/-/g, ' ')}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div className={classNames('h-full rounded-full', r.tone ?? 'bg-brand-500')} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-bold text-ink-800">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function RecentActivityCard({ dash }: { dash: DashboardData }) {
  const data = useAppSelector(selectData);
  const nameOf = (id: string | null) => data.users.find((u) => u.id === id)?.name ?? (id ?? 'System');
  if (dash.recentActivity.length === 0) return null;
  return (
    <SectionCard title="Recent activity" subtitle="Latest actions in your scope" bodyClassName="p-3">
      <ul className="space-y-2">
        {dash.recentActivity.slice(0, 8).map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink-800">{a.summary}</p>
              <p className="truncate text-xs text-ink-500">{nameOf(a.userId)} · {a.entity}</p>
            </div>
            <span className="shrink-0 text-xs text-ink-400">{formatDate(a.timestamp)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function AttentionRow({
  icon, tone, label, value, hint, onClick,
}: {
  icon: React.ReactNode;
  tone: 'amber' | 'red' | 'blue' | 'purple' | 'green';
  label: string;
  value: number;
  hint?: string;
  onClick: () => void;
}) {
  const toneBg = {
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-brand-50 text-brand-600',
  }[tone];
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-ink-50">
      <span className={classNames('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneBg)}>{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-ink-800">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
      <span className="text-lg font-extrabold text-ink-900">{value}</span>
    </button>
  );
}

/** Store-backed name lookups shared by the persona layouts. */
function useLookups() {
  const data = useAppSelector(selectData);
  return useMemo(() => ({
    tenantName: (id?: string | null) => data.tenants.find((t) => t.id === id)?.name ?? '—',
    propertyName: (id?: string | null) => data.properties.find((p) => p.id === id)?.name ?? '—',
    unitCode: (id?: string | null) => data.units.find((u) => u.id === id)?.code ?? '—',
    vendorName: (id?: string | null) => data.vendors.find((v) => v.id === id)?.name ?? '—',
  }), [data.tenants, data.properties, data.units, data.vendors]);
}

// ===========================================================================
// Portfolio (admin / owner) — the full rollup
// ===========================================================================
function PortfolioDashboard({ dash }: { dash: DashboardData | null }) {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const ids = useAppSelector(scopedPropertyIds);
  const maintenanceOn = useAppSelector(selectModuleOn('maintenance'));
  const expensesOn = useAppSelector(selectModuleOn('expenses'));
  const reportsOn = useAppSelector(selectModuleOn('reports'));

  const clientKpis = useMemo(() => computeKpis(data, ids), [data, ids]);
  const kpis = dash?.kpis ?? clientKpis;

  const scopedInvoices = useMemo(
    () => data.invoices.filter((i) => ids.has(i.propertyId) && i.status !== 'cancelled'),
    [data.invoices, ids],
  );

  const trendDash: DashboardData = dash ?? {
    role: (user?.role ?? 'admin') as Role, persona: 'portfolio', kpis,
    rentTrend: aggregateTrend(scopedInvoices), recentActivity: [],
  };

  const performance = useMemo(() => {
    if (dash?.occupancyByProperty) {
      return dash.occupancyByProperty
        .map((p) => ({
          id: p.propertyId, name: p.name, city: p.city, state: p.state,
          occupancyRate: p.occupancyRate, collected: p.collected, outstanding: p.outstanding, netIncome: p.netIncome,
        }))
        .sort((a, b) => b.outstanding - a.outstanding);
    }
    return data.properties
      .filter((p) => ids.has(p.id))
      .map((p) => propertyPerformance(data, p))
      .map((p) => ({
        id: p.property.id, name: p.property.name, city: p.property.city, state: p.property.state,
        occupancyRate: p.occupancyRate, collected: p.collected, outstanding: p.outstanding, netIncome: p.netIncome,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [dash, data, ids]);

  const pendingPayments = useMemo(
    () => data.payments.filter((p) => ids.has(p.propertyId) && p.status === 'pending-verification'),
    [data.payments, ids],
  );
  const overdueInvoices = useMemo(() => scopedInvoices.filter(isOverdue), [scopedInvoices]);
  const expiringLeases = useMemo(
    () => data.leases.filter((l) => ids.has(l.propertyId) && isLeaseExpiring(l)).sort((a, b) => a.endDate.localeCompare(b.endDate)),
    [data.leases, ids],
  );

  const canFinance = user && (isAdminRole(user.role) || ['owner', 'manager', 'finance'].includes(user.role));

  return (
    <div>
      <KpiGrid>
        <StatCard label="Properties" value={kpis.totalProperties} icon={<Building2 className="h-5 w-5" />} tone="green"
          hint={`${kpis.totalUnits} units · ${kpis.totalBuildings} buildings`} onClick={() => navigate('/properties')} />
        <StatCard label="Occupancy" value={formatPercent(kpis.occupancyRate)} icon={<DoorOpen className="h-5 w-5" />} tone="blue"
          hint={`${kpis.occupied} occupied · ${kpis.vacant} vacant`} onClick={() => navigate('/units')} />
        <StatCard label="Annual rent roll" value={formatCurrency(kpis.annualRentRoll, { compact: true })} icon={<Banknote className="h-5 w-5" />} tone="indigo" hint="Contracted rent, occupied units" />
        <StatCard label="Collected" value={formatCurrency(kpis.collected, { compact: true })} icon={<TrendingUp className="h-5 w-5" />} tone="green"
          hint={`${formatPercent(kpis.collectionRate)} of billed`} onClick={() => navigate('/payments')} />
      </KpiGrid>

      <div className="mt-3">
        <KpiGrid>
          <StatCard label="Outstanding" value={formatCurrency(kpis.outstanding, { compact: true })} icon={<ReceiptText className="h-5 w-5" />} tone="amber"
            hint={`${formatCurrency(kpis.overdue, { compact: true })} overdue`} onClick={() => navigate('/invoices')} />
          <StatCard label="Pending verification" value={kpis.pendingVerifications} icon={<BadgeCheck className="h-5 w-5" />} tone={kpis.pendingVerifications > 0 ? 'amber' : 'gray'}
            hint="Receipts to review" onClick={() => navigate(canFinance ? '/payments/verification' : '/payments')} />
          {maintenanceOn && (
          <StatCard label="Open maintenance" value={kpis.openMaintenance} icon={<Wrench className="h-5 w-5" />} tone={kpis.openMaintenance > 0 ? 'red' : 'gray'}
            hint="Active work orders" onClick={() => navigate('/maintenance')} />
          )}
          {expensesOn && (
          <StatCard label="Net income" value={formatCurrency(kpis.netIncome, { compact: true })} icon={<Wallet className="h-5 w-5" />} tone={kpis.netIncome >= 0 ? 'green' : 'red'}
            hint={`${formatCurrency(kpis.totalExpenses, { compact: true })} expenses`} onClick={reportsOn ? () => navigate('/reports') : undefined} />
          )}
        </KpiGrid>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <RentTrendCard dash={trendDash} className="lg:col-span-2" />
        <UnitStatusCard kpis={kpis} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Property performance" subtitle="Sorted by outstanding balance" className="lg:col-span-2" bodyClassName="p-0"
          action={<button onClick={() => navigate('/properties')} className="btn-ghost text-xs">View all <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
          <DataGrid head={['Property', { label: 'Occupancy' }, { label: 'Collected', right: true }, { label: 'Outstanding', right: true }, ...(expensesOn ? [{ label: 'Net income', right: true }] : [])]}>
            {performance.slice(0, 6).map((p) => (
              <tr key={p.id} onClick={() => navigate(`/properties/${p.id}`)} className="cursor-pointer transition-colors hover:bg-brand-50/40">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500"><Building2 className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-800">{p.name}</p>
                      <p className="truncate text-xs text-ink-500">{[p.city, p.state].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                </td>
                <td className="td">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-ink-600">{formatPercent(p.occupancyRate)}</span>
                    <ProgressBar value={p.occupancyRate} className="w-20" tone={p.occupancyRate >= 80 ? 'green' : p.occupancyRate >= 50 ? 'amber' : 'red'} />
                  </div>
                </td>
                <td className="td text-right"><Money value={p.collected} compact /></td>
                <td className="td text-right"><Money value={p.outstanding} compact className={p.outstanding > 0 ? 'text-amber-600 font-semibold' : ''} /></td>
                {expensesOn && <td className="td text-right"><Money value={p.netIncome} compact colorNegative /></td>}
              </tr>
            ))}
          </DataGrid>
        </SectionCard>

        <SectionCard title="Needs attention" subtitle="Items awaiting action" bodyClassName="p-3">
          <div className="space-y-2">
            <AttentionRow icon={<BadgeCheck className="h-4 w-4" />} tone="amber" label="Payments to verify" value={pendingPayments.length}
              onClick={() => navigate(canFinance ? '/payments/verification' : '/payments')} />
            <AttentionRow icon={<AlertTriangle className="h-4 w-4" />} tone="red" label="Overdue invoices" value={overdueInvoices.length}
              hint={formatCurrency(overdueInvoices.reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0), { compact: true })}
              onClick={() => navigate('/invoices')} />
            <AttentionRow icon={<CalendarClock className="h-4 w-4" />} tone="blue" label="Leases expiring soon" value={expiringLeases.length} onClick={() => navigate('/leases')} />
            {maintenanceOn && (
            <AttentionRow icon={<Wrench className="h-4 w-4" />} tone="purple" label="Open maintenance" value={kpis.openMaintenance} onClick={() => navigate('/maintenance')} />
            )}
          </div>

          {expiringLeases.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Upcoming lease endings</p>
              <ul className="space-y-2">
                {expiringLeases.slice(0, 4).map((l) => {
                  const tenant = data.tenants.find((t) => t.id === l.tenantId);
                  const unit = data.units.find((u) => u.id === l.unitId);
                  const d = daysUntil(l.endDate);
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-800">{tenant?.name ?? 'Vacant'}</p>
                        <p className="truncate text-xs text-ink-500">{unit?.code} · {formatDate(l.endDate)}</p>
                      </div>
                      <StatusBadge meta={d <= 30 ? { label: `${d}d left`, tone: 'red' } : leaseStatusMeta(l.status)} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>

      {pendingPayments.length > 0 && (
        <SectionCard title="Recent payments awaiting verification" subtitle="Tenant-submitted receipts pending finance review" className="mt-4" bodyClassName="p-0"
          action={<button onClick={() => navigate(canFinance ? '/payments/verification' : '/payments')} className="btn-ghost text-xs">Open queue <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
          <DataGrid head={['Payment', 'Tenant', 'Method', { label: 'Amount', right: true }, 'Submitted']}>
            {pendingPayments.slice(0, 5).map((p) => {
              const tenant = data.tenants.find((t) => t.id === p.tenantId);
              return (
                <tr key={p.id} onClick={() => navigate(canFinance ? '/payments/verification' : '/payments')} className="cursor-pointer hover:bg-brand-50/40">
                  <td className="td font-semibold text-ink-800">{p.code}</td>
                  <td className="td">{tenant?.name ?? '—'}</td>
                  <td className="td capitalize">{p.method.replace('-', ' ')}</td>
                  <td className="td text-right"><Money value={p.amount} /></td>
                  <td className="td text-ink-500">{formatDate(p.paymentDate)}</td>
                </tr>
              );
            })}
          </DataGrid>
        </SectionCard>
      )}

      {kpis.totalProperties === 0 && (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 py-16 text-center">
          <Home className="mb-3 h-8 w-8 text-ink-400" />
          <p className="text-sm font-semibold text-ink-700">No properties in your scope yet</p>
          <p className="mt-1 text-sm text-ink-500">Once properties are assigned to you they’ll appear here.</p>
        </div>
      )}
    </div>
  );
}

function aggregateTrend(invoices: { issueDate: string; total: number; amountPaid: number }[]) {
  const map = new Map<string, { month: string; billed: number; collected: number }>();
  for (const inv of invoices) {
    const m = inv.issueDate.slice(0, 7);
    const e = map.get(m) ?? { month: m, billed: 0, collected: 0 };
    e.billed += inv.total;
    e.collected += inv.amountPaid;
    map.set(m, e);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-8);
}

// ===========================================================================
// Finance — collections & approvals
// ===========================================================================
function FinanceDashboard({ dash }: { dash: DashboardData | null }) {
  const navigate = useNavigate();
  const { tenantName, propertyName, vendorName } = useLookups();
  const expensesOn = useAppSelector(selectModuleOn('expenses'));
  if (!dash) return <DashLoading />;
  const { kpis } = dash;
  const pending = dash.pendingPayments ?? [];
  const overdue = dash.overdueInvoices ?? [];
  const expenses = dash.expensesPending ?? [];

  return (
    <div>
      <KpiGrid>
        <StatCard label="Collected" value={formatCurrency(kpis.collected, { compact: true })} icon={<TrendingUp className="h-5 w-5" />} tone="green"
          hint={`${formatPercent(kpis.collectionRate)} of billed`} onClick={() => navigate('/payments')} />
        <StatCard label="Outstanding" value={formatCurrency(kpis.outstanding, { compact: true })} icon={<ReceiptText className="h-5 w-5" />} tone="amber"
          hint={`${formatCurrency(kpis.overdue, { compact: true })} overdue`} onClick={() => navigate('/invoices')} />
        <StatCard label="To verify" value={kpis.pendingVerifications} icon={<BadgeCheck className="h-5 w-5" />} tone={kpis.pendingVerifications > 0 ? 'amber' : 'gray'}
          hint="Receipts in the queue" onClick={() => navigate('/payments/verification')} />
        {expensesOn && (
        <StatCard label="Expenses" value={formatCurrency(kpis.totalExpenses, { compact: true })} icon={<Wallet className="h-5 w-5" />} tone="indigo"
          hint={`${expenses.length} awaiting approval`} onClick={() => navigate('/expenses')} />
        )}
      </KpiGrid>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <RentTrendCard dash={dash} className={expensesOn ? 'lg:col-span-2' : 'lg:col-span-3'} />
        {expensesOn && (
        <SectionCard title="Expenses by category" subtitle="Approved & paid" bodyClassName="p-3">
          {(dash.expensesByCategory ?? []).length === 0
            ? <EmptyState title="No expenses" />
            : <BreakdownBars rows={(dash.expensesByCategory ?? []).slice(0, 6).map((c) => ({ label: c.category, value: Math.round(c.total / 1000) }))} />}
          <p className="mt-2 text-[11px] text-ink-400">Values in ₦ thousands</p>
        </SectionCard>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Verification queue" subtitle={`${pending.length} receipt${pending.length === 1 ? '' : 's'} to review`} bodyClassName="p-0"
          action={<button onClick={() => navigate('/payments/verification')} className="btn-ghost text-xs">Open queue <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
          {pending.length === 0 ? <div className="p-4"><EmptyState title="Queue is clear" description="No receipts waiting on verification." /></div> : (
            <DataGrid head={['Payment', 'Tenant', { label: 'Amount', right: true }, 'Submitted']}>
              {pending.slice(0, 8).map((p) => (
                <tr key={p.id} onClick={() => navigate('/payments/verification')} className="cursor-pointer hover:bg-brand-50/40">
                  <td className="td font-semibold text-ink-800">{p.code}</td>
                  <td className="td">{tenantName(p.tenantId)}</td>
                  <td className="td text-right"><Money value={p.amount} /></td>
                  <td className="td text-ink-500">{formatDate(p.submittedAt)}</td>
                </tr>
              ))}
            </DataGrid>
          )}
        </SectionCard>

        <SectionCard title="Overdue invoices" subtitle="Chase collections" bodyClassName="p-0"
          action={<button onClick={() => navigate('/invoices')} className="btn-ghost text-xs">All invoices <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
          {overdue.length === 0 ? <div className="p-4"><EmptyState title="Nothing overdue" /></div> : (
            <DataGrid head={['Invoice', 'Tenant', 'Due', { label: 'Outstanding', right: true }]}>
              {overdue.slice(0, 8).map((i) => (
                <tr key={i.id} onClick={() => navigate(`/invoices/${i.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                  <td className="td font-semibold text-ink-800">{i.code}</td>
                  <td className="td">{tenantName(i.tenantId)}</td>
                  <td className="td text-ink-500">{formatDate(i.dueDate)}</td>
                  <td className="td text-right"><Money value={i.outstanding} className="font-semibold text-amber-600" /></td>
                </tr>
              ))}
            </DataGrid>
          )}
        </SectionCard>
      </div>

      {expensesOn && (
      <SectionCard title="Expenses awaiting approval" className="mt-4" bodyClassName="p-0"
        action={<button onClick={() => navigate('/expenses')} className="btn-ghost text-xs">Review <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
        {expenses.length === 0 ? <div className="p-4"><EmptyState title="Nothing to approve" /></div> : (
          <DataGrid head={['Expense', 'Property', 'Category', 'Vendor', { label: 'Amount', right: true }]}>
            {expenses.slice(0, 8).map((e) => (
              <tr key={e.id} onClick={() => navigate('/expenses')} className="cursor-pointer hover:bg-brand-50/40">
                <td className="td font-semibold text-ink-800">{e.code}</td>
                <td className="td">{propertyName(e.propertyId)}</td>
                <td className="td capitalize">{e.category}</td>
                <td className="td">{e.vendorId ? vendorName(e.vendorId) : '—'}</td>
                <td className="td text-right"><Money value={e.amount} /></td>
              </tr>
            ))}
          </DataGrid>
        )}
      </SectionCard>
      )}
    </div>
  );
}

// ===========================================================================
// Operations (manager) — occupancy & work orders
// ===========================================================================
function OperationsDashboard({ dash }: { dash: DashboardData | null }) {
  const navigate = useNavigate();
  const { tenantName, propertyName, unitCode } = useLookups();
  const maintenanceOn = useAppSelector(selectModuleOn('maintenance'));
  if (!dash) return <DashLoading />;
  const { kpis } = dash;
  const queue = dash.maintenanceQueue;
  const expiring = dash.expiringLeases ?? [];
  const pending = dash.pendingPayments ?? [];

  return (
    <div>
      <KpiGrid>
        <StatCard label="Occupancy" value={formatPercent(kpis.occupancyRate)} icon={<DoorOpen className="h-5 w-5" />} tone="blue"
          hint={`${kpis.occupied} occupied · ${kpis.vacant} vacant`} onClick={() => navigate('/units')} />
        {maintenanceOn && (
        <StatCard label="Open maintenance" value={kpis.openMaintenance} icon={<Wrench className="h-5 w-5" />} tone={kpis.openMaintenance > 0 ? 'red' : 'gray'}
          hint={`${queue?.emergencyCount ?? 0} emergencies`} onClick={() => navigate('/maintenance')} />
        )}
        <StatCard label="To verify" value={kpis.pendingVerifications} icon={<BadgeCheck className="h-5 w-5" />} tone={kpis.pendingVerifications > 0 ? 'amber' : 'gray'}
          hint="Receipts in the queue" onClick={() => navigate('/payments/verification')} />
        <StatCard label="Expiring leases" value={kpis.expiringLeases} icon={<CalendarClock className="h-5 w-5" />} tone={kpis.expiringLeases > 0 ? 'amber' : 'gray'}
          hint="Next 60 days" onClick={() => navigate('/leases')} />
      </KpiGrid>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <UnitStatusCard kpis={kpis} />
        {maintenanceOn && (
        <SectionCard title="Work order queue" subtitle={`${queue?.openCount ?? 0} open`} className="lg:col-span-2" bodyClassName="p-3">
          {queue ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">By status</p>
                <BreakdownBars rows={Object.entries(queue.byStatus).map(([k, v]) => ({ label: k, value: v }))} />
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">By urgency</p>
                <BreakdownBars rows={[
                  { label: 'emergency', value: queue.byUrgency.emergency, tone: 'bg-red-500' },
                  { label: 'high', value: queue.byUrgency.high, tone: 'bg-orange-500' },
                  { label: 'medium', value: queue.byUrgency.medium, tone: 'bg-amber-500' },
                  { label: 'low', value: queue.byUrgency.low, tone: 'bg-brand-500' },
                ]} />
              </div>
            </div>
          ) : <EmptyState title="No work orders" />}
        </SectionCard>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {maintenanceOn && (
        <SectionCard title="Maintenance queue" subtitle="Most urgent first" className="lg:col-span-2" bodyClassName="p-0"
          action={<button onClick={() => navigate('/maintenance')} className="btn-ghost text-xs">All work orders <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
          {!queue || queue.items.length === 0 ? <div className="p-4"><EmptyState title="Nothing open" /></div> : (
            <DataGrid head={['Work order', 'Property', 'Urgency', 'Status']}>
              {queue.items.slice(0, 8).map((m) => (
                <tr key={m.id} onClick={() => navigate(`/maintenance/${m.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                  <td className="td">
                    <p className="font-semibold text-ink-800">{m.title}</p>
                    <p className="text-xs text-ink-500">{m.code} · {unitCode(m.unitId)}</p>
                  </td>
                  <td className="td">{propertyName(m.propertyId)}</td>
                  <td className="td"><StatusBadge meta={urgencyMeta(m.urgency)} /></td>
                  <td className="td"><StatusBadge meta={maintenanceStatusMeta(m.status)} /></td>
                </tr>
              ))}
            </DataGrid>
          )}
        </SectionCard>
        )}

        <SectionCard title="Attention" bodyClassName="p-3">
          <div className="space-y-2">
            <AttentionRow icon={<BadgeCheck className="h-4 w-4" />} tone="amber" label="Payments to verify" value={pending.length} onClick={() => navigate('/payments/verification')} />
            <AttentionRow icon={<CalendarClock className="h-4 w-4" />} tone="blue" label="Leases expiring soon" value={expiring.length} onClick={() => navigate('/leases')} />
            {maintenanceOn && (
            <AttentionRow icon={<Flame className="h-4 w-4" />} tone="red" label="Emergency jobs" value={queue?.emergencyCount ?? 0} onClick={() => navigate('/maintenance')} />
            )}
          </div>
          {expiring.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Upcoming lease endings</p>
              <ul className="space-y-2">
                {expiring.slice(0, 4).map((l) => {
                  const d = daysUntil(l.endDate);
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-800">{tenantName(l.tenantId)}</p>
                        <p className="truncate text-xs text-ink-500">{unitCode(l.unitId)} · {formatDate(l.endDate)}</p>
                      </div>
                      <StatusBadge meta={d <= 30 ? { label: `${d}d left`, tone: 'red' } : { label: `${d}d`, tone: 'amber' }} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ===========================================================================
// Leasing (agent) — listings & pipeline
// ===========================================================================
function LeasingDashboard({ dash }: { dash: DashboardData | null }) {
  const navigate = useNavigate();
  const { propertyName } = useLookups();
  if (!dash) return <DashLoading />;
  const board = dash.leasing;
  if (!board) return <DashLoading />;

  const funnelOrder: { key: keyof typeof board.leadFunnel; tone: string }[] = [
    { key: 'new', tone: 'bg-blue-500' },
    { key: 'contacted', tone: 'bg-indigo-500' },
    { key: 'viewing-scheduled', tone: 'bg-violet-500' },
    { key: 'negotiating', tone: 'bg-amber-500' },
    { key: 'converted', tone: 'bg-brand-500' },
    { key: 'lost', tone: 'bg-ink-300' },
  ];

  return (
    <div>
      <KpiGrid>
        <StatCard label="Live listings" value={board.liveListings} icon={<KeyRound className="h-5 w-5" />} tone="green" hint="Published now" onClick={() => navigate('/listings')} />
        <StatCard label="Active leads" value={board.activeLeads} icon={<Users className="h-5 w-5" />} tone="blue" hint="In the pipeline" onClick={() => navigate('/leads')} />
        <StatCard label="Viewings" value={board.viewingsScheduled} icon={<CalendarClock className="h-5 w-5" />} tone="indigo" hint="Scheduled" onClick={() => navigate('/leads')} />
        <StatCard label="Converted" value={board.convertedLeads} icon={<Target className="h-5 w-5" />} tone="green" hint="Leads won" onClick={() => navigate('/leads')} />
      </KpiGrid>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Lead funnel" subtitle="By stage" bodyClassName="p-3">
          <BreakdownBars rows={funnelOrder.map((f) => ({ label: f.key, value: board.leadFunnel[f.key], tone: f.tone }))} />
        </SectionCard>

        <SectionCard title="Recent leads" subtitle="Latest enquiries" className="lg:col-span-2" bodyClassName="p-0"
          action={<button onClick={() => navigate('/leads')} className="btn-ghost text-xs">All leads <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
          {board.recentLeads.length === 0 ? <div className="p-4"><EmptyState title="No leads yet" /></div> : (
            <DataGrid head={['Lead', 'Property', 'Stage', 'Viewing', 'Added']}>
              {board.recentLeads.slice(0, 8).map((l) => (
                <tr key={l.id} onClick={() => navigate('/leads')} className="cursor-pointer hover:bg-brand-50/40">
                  <td className="td font-semibold text-ink-800">{l.name}</td>
                  <td className="td">{l.propertyId ? propertyName(l.propertyId) : '—'}</td>
                  <td className="td"><StatusBadge meta={leadStatusMeta(l.status)} /></td>
                  <td className="td text-ink-500">{l.viewingDate ? formatDate(l.viewingDate) : '—'}</td>
                  <td className="td text-ink-500">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </DataGrid>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Units to fill" subtitle={`${board.vacantUnits} vacant across your scope`} className="mt-4" bodyClassName="p-0"
        action={<button onClick={() => navigate('/units')} className="btn-ghost text-xs">All units <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
        {board.availableUnits.length === 0 ? <div className="p-4"><EmptyState title="Everything is let" /></div> : (
          <DataGrid head={['Unit', 'Property', 'Type', 'Status', { label: 'Rent', right: true }]}>
            {board.availableUnits.slice(0, 8).map((u) => (
              <tr key={u.id} onClick={() => navigate(`/units/${u.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                <td className="td font-semibold text-ink-800">{u.code}</td>
                <td className="td">{propertyName(u.propertyId)}</td>
                <td className="td capitalize">{u.type}</td>
                <td className="td capitalize">{u.status}</td>
                <td className="td text-right"><Money value={u.rent} compact /></td>
              </tr>
            ))}
          </DataGrid>
        )}
      </SectionCard>
    </div>
  );
}

// ===========================================================================
// Maintenance (technician) — my work orders
// ===========================================================================
function MaintenanceDashboard({ dash }: { dash: DashboardData | null }) {
  const navigate = useNavigate();
  const { propertyName, unitCode } = useLookups();
  const user = useAppSelector(selectCurrentUser);
  const data = useAppSelector(selectData);
  const myPayouts = useAppSelector((s) =>
    s.data.maintenancePayouts.filter((p) => p.staffId === user?.id),
  );
  const workOrderCode = (id: string) => data.maintenance.find((m) => m.id === id)?.code ?? id;
  if (!dash) return <DashLoading />;
  const queue = dash.maintenanceQueue;
  const owedThisMonth = myPayouts.filter((p) => p.status !== 'rejected').reduce((sum, p) => sum + p.amount, 0);
  const paidTotal = myPayouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <KpiGrid>
        <StatCard label="My open jobs" value={queue?.openCount ?? 0} icon={<Wrench className="h-5 w-5" />} tone={(queue?.openCount ?? 0) > 0 ? 'red' : 'gray'}
          hint="Assigned to me" onClick={() => navigate('/maintenance')} />
        <StatCard label="Emergencies" value={queue?.emergencyCount ?? 0} icon={<Flame className="h-5 w-5" />} tone={(queue?.emergencyCount ?? 0) > 0 ? 'red' : 'gray'} hint="Highest priority" />
        <StatCard label="In progress" value={queue?.byStatus['in-progress'] ?? 0} icon={<Clock className="h-5 w-5" />} tone="blue" hint="Currently working" />
        <StatCard label="Completed" value={queue?.byStatus.completed ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" hint="Awaiting verification" />
      </KpiGrid>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <SectionCard title="My workload" subtitle="By status" bodyClassName="p-3">
          {queue ? <BreakdownBars rows={Object.entries(queue.byStatus).map(([k, v]) => ({ label: k, value: v }))} /> : <EmptyState title="Nothing assigned" />}
        </SectionCard>

        <SectionCard title="My work orders" subtitle="Most urgent first" className="lg:col-span-2" bodyClassName="p-0"
          action={<button onClick={() => navigate('/maintenance')} className="btn-ghost text-xs">Open board <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
          {!queue || queue.items.length === 0 ? <div className="p-4"><EmptyState title="No open jobs" description="Work orders assigned to you will show up here." /></div> : (
            <DataGrid head={['Work order', 'Property', 'Urgency', 'Status']}>
              {queue.items.slice(0, 10).map((m) => (
                <tr key={m.id} onClick={() => navigate(`/maintenance/${m.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                  <td className="td">
                    <p className="font-semibold text-ink-800">{m.title}</p>
                    <p className="text-xs text-ink-500">{m.code} · {unitCode(m.unitId)}</p>
                  </td>
                  <td className="td">{propertyName(m.propertyId)}</td>
                  <td className="td"><StatusBadge meta={urgencyMeta(m.urgency)} /></td>
                  <td className="td"><StatusBadge meta={maintenanceStatusMeta(m.status)} /></td>
                </tr>
              ))}
            </DataGrid>
          )}
        </SectionCard>
      </div>

      {myPayouts.length > 0 && (
        <SectionCard
          title="My payments"
          subtitle={`${formatCurrency(paidTotal, { compact: true })} paid · ${formatCurrency(owedThisMonth - paidTotal, { compact: true })} pending`}
          className="mt-4"
          bodyClassName="p-0"
          action={<button onClick={() => navigate('/maintenance')} className="btn-ghost text-xs">Open board <ArrowUpRight className="h-3.5 w-3.5" /></button>}
        >
          <DataGrid head={['Payout', 'Work order', { label: 'Amount', right: true }, 'Status']}>
            {myPayouts.slice(0, 8).map((p) => (
              <tr key={p.id} onClick={() => navigate(`/maintenance/${p.maintenanceId}`)} className="cursor-pointer hover:bg-brand-50/40">
                <td className="td font-semibold text-ink-800">{p.code}</td>
                <td className="td text-ink-500">{workOrderCode(p.maintenanceId)}</td>
                <td className="td text-right"><Money value={p.amount} /></td>
                <td className="td"><StatusBadge meta={payoutStatusMeta(p.status)} /></td>
              </tr>
            ))}
          </DataGrid>
        </SectionCard>
      )}

      <div className="mt-4">
        <RecentActivityCard dash={dash} />
      </div>
    </div>
  );
}

// ===========================================================================
// Newcomer (registered, not on any property yet)
// ===========================================================================
function NewcomerDashboard() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const invites = data.invitations;

  return (
    <div>
      <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-extrabold text-ink-900">You're not on any property yet</p>
            <p className="mt-1 max-w-xl text-sm text-ink-600">
              Create a property to run it as its owner, or accept an invitation from an owner who wants you on their team.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn-primary" onClick={() => navigate('/properties')}>Create a property</button>
            <button className="btn-secondary" onClick={() => navigate('/invitations')}>
              Invitations{invites.length > 0 ? ` (${invites.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StepCard icon={<UserPlus className="h-5 w-5" />} n={1} title="Get invited or start one"
          body="Ask a property owner to invite your email, or register your own property." />
        <StepCard icon={<ClipboardList className="h-5 w-5" />} n={2} title="Accept the invitation"
          body="Open Invitations and accept — you'll join that property's team with your assigned role." />
        <StepCard icon={<FileText className="h-5 w-5" />} n={3} title="See the property"
          body="Once you're a member, its data unlocks and your dashboard fills in." />
      </div>

      <SectionCard title="Your invitations" className="mt-5" bodyClassName="p-3"
        action={<button onClick={() => navigate('/invitations')} className="btn-ghost text-xs">Open <ArrowUpRight className="h-3.5 w-3.5" /></button>}>
        {invites.length === 0 ? (
          <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No pending invitations" description="When an owner invites you, it appears here." />
        ) : (
          <ul className="space-y-2">
            {invites.slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">{m.propertyName ?? m.propertyId}</p>
                  <p className="truncate text-xs text-ink-500">Role: {ROLE_LABELS[m.role] ?? m.role}</p>
                </div>
                <button className="btn-secondary text-xs" onClick={() => navigate('/invitations')}>Review</button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function StepCard({ icon, n, title, body }: { icon: React.ReactNode; n: number; title: string; body: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Step {n}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-500">{body}</p>
    </div>
  );
}

/** Shown in place of a persona dashboard whose whole subject is a module that is turned off. */
function ModuleOffNotice({ name }: { name: string }) {
  return (
    <div data-testid="dashboard-module-off" className="mt-5">
      <EmptyState title={`${name} is turned off`} />
    </div>
  );
}
