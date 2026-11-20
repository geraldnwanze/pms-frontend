'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  Banknote, AlertTriangle, Wallet, Users, ReceiptText, Building2, Lock,
  TrendingUp, DoorOpen, BadgeCheck,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useAppSelector } from '@/store/hooks';
import {
  selectData, selectCurrentUser, scopedPropertyIds, computeKpis, propertyPerformance,
  isOverdue,
} from '@/store/selectors';
import { PageHeader, SectionCard, StatCard, Badge, EmptyState, ExportMenu } from '@/components/ui';
import { can } from '@/config/roles';
import { formatCurrency, formatPercent, formatDate, daysOverdue, classNames } from '@/lib/format';
import type { Row } from '@/lib/export';

const tc = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmt = (n: number) => formatCurrency(n);
const shortName = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);
const PALETTE = ['#059669', '#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#ef4444', '#0891b2', '#6366f1', '#db2777', '#64748b'];

// ===========================================================================
// Reports
// ===========================================================================
interface BuiltReport { rows: Row[]; summary: { label: string; value: string }[] }
type ReportKey = 'rent-roll' | 'arrears' | 'collections' | 'owner-statement' | 'expense-summary' | 'occupancy';

const REPORT_DEFS: { key: ReportKey; label: string; blurb: string; icon: React.ReactNode }[] = [
  { key: 'rent-roll', label: 'Rent Roll', blurb: 'Active leases & contracted rent', icon: <Banknote className="h-4 w-4" /> },
  { key: 'arrears', label: 'Arrears / Outstanding', blurb: 'Unpaid & overdue invoices', icon: <AlertTriangle className="h-4 w-4" /> },
  { key: 'collections', label: 'Collections', blurb: 'Verified payments received', icon: <Wallet className="h-4 w-4" /> },
  { key: 'owner-statement', label: 'Owner Statement', blurb: 'Income & expenses by owner', icon: <Users className="h-4 w-4" /> },
  { key: 'expense-summary', label: 'Expense Summary', blurb: 'Spend grouped by category', icon: <ReceiptText className="h-4 w-4" /> },
  { key: 'occupancy', label: 'Occupancy', blurb: 'Unit occupancy by property', icon: <Building2 className="h-4 w-4" /> },
];

export function Reports() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const ids = useAppSelector(scopedPropertyIds);
  const [active, setActive] = useState<ReportKey>('rent-roll');
  const canExport = can(user?.role, 'export');

  const built = useMemo<Record<ReportKey, BuiltReport>>(() => {
    const props = data.properties.filter((p) => ids.has(p.id));
    const units = data.units.filter((u) => ids.has(u.propertyId));
    const leases = data.leases.filter((l) => ids.has(l.propertyId));
    const invoices = data.invoices.filter((i) => ids.has(i.propertyId) && i.status !== 'cancelled');
    const payments = data.payments.filter((p) => ids.has(p.propertyId));
    const expenses = data.expenses.filter((e) => ids.has(e.propertyId) && (e.status === 'approved' || e.status === 'paid'));
    const perfList = props.map((p) => propertyPerformance(data, p));

    const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
    const unitCode = (id: string) => data.units.find((u) => u.id === id)?.code ?? '—';
    const tenantName = (id: string) => data.tenants.find((t) => t.id === id)?.name ?? '—';
    const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? id;

    // Rent roll — active/expiring/renewed leases
    const activeLeases = leases.filter((l) => ['active', 'expiring', 'renewed'].includes(l.status));
    const rentRoll: Row[] = activeLeases
      .map((l) => ({
        Lease: l.code, Property: propName(l.propertyId), Unit: unitCode(l.unitId), Tenant: tenantName(l.tenantId),
        Start: formatDate(l.startDate), End: formatDate(l.endDate), Rent: fmt(l.rent), Cycle: tc(l.billingCycle), Status: tc(l.status),
      }))
      .sort((a, b) => String(a.Property).localeCompare(String(b.Property)));
    const annualRentRoll = units.filter((u) => u.status === 'occupied').reduce((s, u) => s + u.rent, 0);

    // Arrears — invoices with an outstanding balance
    const arrearsInv = invoices.filter((i) => i.total - i.amountPaid > 0).sort((a, b) => (b.total - b.amountPaid) - (a.total - a.amountPaid));
    const arrears: Row[] = arrearsInv.map((i) => ({
      Invoice: i.code, Property: propName(i.propertyId), Unit: unitCode(i.unitId), Tenant: tenantName(i.tenantId),
      Due: formatDate(i.dueDate), Total: fmt(i.total), Paid: fmt(i.amountPaid), Outstanding: fmt(i.total - i.amountPaid),
      Days_Overdue: daysOverdue(i.dueDate), Status: tc(i.status),
    }));
    const totalOutstanding = arrearsInv.reduce((s, i) => s + (i.total - i.amountPaid), 0);
    const overdueInv = arrearsInv.filter(isOverdue);
    const totalOverdue = overdueInv.reduce((s, i) => s + (i.total - i.amountPaid), 0);

    // Collections — approved payments
    const approved = payments.filter((p) => p.status === 'approved').sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    const collections: Row[] = approved.map((p) => ({
      Payment: p.code, Date: formatDate(p.paymentDate), Property: propName(p.propertyId), Tenant: tenantName(p.tenantId),
      Method: tc(p.method), Type: tc(p.type), Amount: fmt(p.amount),
    }));
    const totalCollected = approved.reduce((s, p) => s + p.amount, 0);
    const collectedThisMonth = approved.filter((p) => p.paymentDate.slice(0, 7) === '2026-08').reduce((s, p) => s + p.amount, 0);

    // Owner statement — aggregate property performance weighted by ownership stake
    const ownerAgg = new Map<string, { billed: number; collected: number; expenses: number; outstanding: number; net: number; props: Set<string> }>();
    props.forEach((p) => {
      const perf = propertyPerformance(data, p);
      p.owners.forEach((stake) => {
        const share = stake.percentage / 100;
        const e = ownerAgg.get(stake.ownerId) ?? { billed: 0, collected: 0, expenses: 0, outstanding: 0, net: 0, props: new Set<string>() };
        e.billed += perf.expectedBilled * share;
        e.collected += perf.collected * share;
        e.expenses += perf.expenses * share;
        e.outstanding += perf.outstanding * share;
        e.net += perf.netIncome * share;
        e.props.add(p.id);
        ownerAgg.set(stake.ownerId, e);
      });
    });
    const ownerStatement: Row[] = [...ownerAgg.entries()]
      .sort((a, b) => b[1].net - a[1].net)
      .map(([ownerId, e]) => ({
        Owner: userName(ownerId), Properties: e.props.size, Billed: fmt(e.billed), Collected: fmt(e.collected),
        Expenses: fmt(e.expenses), Outstanding: fmt(e.outstanding), Net_Income: fmt(e.net),
        Collection_Rate: formatPercent(e.billed > 0 ? (e.collected / e.billed) * 100 : 0),
      }));

    // Expense summary — grouped by category
    const catMap = new Map<string, { amount: number; count: number }>();
    expenses.forEach((e) => {
      const cur = catMap.get(e.category) ?? { amount: 0, count: 0 };
      cur.amount += e.amount; cur.count += 1; catMap.set(e.category, cur);
    });
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const expenseSummary: Row[] = [...catMap.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([cat, v]) => ({
        Category: tc(cat), Transactions: v.count, Amount: fmt(v.amount),
        Share: formatPercent(totalExpenses > 0 ? (v.amount / totalExpenses) * 100 : 0),
      }));
    const topCat = String(expenseSummary[0]?.Category ?? '—');

    // Occupancy — per property
    const occupancy: Row[] = perfList
      .slice()
      .sort((a, b) => b.occupancyRate - a.occupancyRate)
      .map((p) => ({
        Property: p.property.name, City: `${p.property.city}, ${p.property.state}`, Units: p.units,
        Occupied: p.occupied, Vacant: p.vacant, Occupancy_Rate: formatPercent(p.occupancyRate),
      }));
    const overallUnits = perfList.reduce((s, p) => s + p.units, 0);
    const overallOccupied = perfList.reduce((s, p) => s + p.occupied, 0);
    const overallVacant = perfList.reduce((s, p) => s + p.vacant, 0);
    const reservedUnits = units.filter((u) => u.status === 'reserved').length;
    const rentable = overallOccupied + overallVacant + reservedUnits; // matches computeKpis occupancyRate

    return {
      'rent-roll': { rows: rentRoll, summary: [
        { label: 'Active leases', value: String(activeLeases.length) },
        { label: 'Occupied units', value: String(units.filter((u) => u.status === 'occupied').length) },
        { label: 'Annual rent roll', value: fmt(annualRentRoll) },
        { label: 'Properties', value: String(props.length) },
      ] },
      arrears: { rows: arrears, summary: [
        { label: 'Invoices in arrears', value: String(arrearsInv.length) },
        { label: 'Total outstanding', value: fmt(totalOutstanding) },
        { label: 'Overdue invoices', value: String(overdueInv.length) },
        { label: 'Overdue amount', value: fmt(totalOverdue) },
      ] },
      collections: { rows: collections, summary: [
        { label: 'Payments', value: String(approved.length) },
        { label: 'Total collected', value: fmt(totalCollected) },
        { label: 'Collected in Aug', value: fmt(collectedThisMonth) },
        { label: 'Avg. payment', value: fmt(approved.length ? totalCollected / approved.length : 0) },
      ] },
      'owner-statement': { rows: ownerStatement, summary: [
        { label: 'Owners', value: String(ownerStatement.length) },
        { label: 'Total collected', value: fmt([...ownerAgg.values()].reduce((s, e) => s + e.collected, 0)) },
        { label: 'Total expenses', value: fmt([...ownerAgg.values()].reduce((s, e) => s + e.expenses, 0)) },
        { label: 'Net income', value: fmt([...ownerAgg.values()].reduce((s, e) => s + e.net, 0)) },
      ] },
      'expense-summary': { rows: expenseSummary, summary: [
        { label: 'Categories', value: String(expenseSummary.length) },
        { label: 'Total spend', value: fmt(totalExpenses) },
        { label: 'Transactions', value: String(expenses.length) },
        { label: 'Top category', value: topCat },
      ] },
      occupancy: { rows: occupancy, summary: [
        { label: 'Portfolio occupancy', value: formatPercent(rentable > 0 ? (overallOccupied / rentable) * 100 : 0) },
        { label: 'Total units', value: String(overallUnits) },
        { label: 'Occupied', value: String(overallOccupied) },
        { label: 'Vacant', value: String(overallVacant) },
      ] },
    };
  }, [data, ids]);

  const def = REPORT_DEFS.find((r) => r.key === active)!;
  const current = built[active];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate and export financial & operational reports" />

      <div className="grid gap-4 lg:grid-cols-[264px_1fr]">
        {/* Report picker */}
        <div className="space-y-1.5">
          {REPORT_DEFS.map((r) => {
            const on = r.key === active;
            return (
              <button key={r.key} onClick={() => setActive(r.key)}
                className={classNames('w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
                  on ? 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-200' : 'border-ink-200 bg-white hover:bg-ink-50')}>
                <div className="flex items-center gap-2.5">
                  <span className={classNames('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', on ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>{r.icon}</span>
                  <div className="min-w-0">
                    <p className={classNames('text-sm font-semibold', on ? 'text-brand-800' : 'text-ink-800')}>{r.label}</p>
                    <p className="truncate text-xs text-ink-500">{r.blurb}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected report */}
        <SectionCard title={def.label} subtitle={def.blurb} bodyClassName="p-5"
          action={canExport
            ? <ExportMenu filename={`report-${active}`} title={`${def.label} report`} rows={current.rows} subtitle="Property Management System" size="md" />
            : <Badge tone="gray"><span className="flex items-center gap-1"><Lock className="h-3 w-3" /> View only</span></Badge>}>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {current.summary.map((s) => (
              <div key={s.label} className="rounded-xl border border-ink-200 bg-white px-3.5 py-3">
                <p className="text-xs font-medium text-ink-500">{s.label}</p>
                <p className="mt-0.5 truncate text-lg font-extrabold tracking-tight text-ink-900" title={s.value}>{s.value}</p>
              </div>
            ))}
          </div>
          <ReportTable rows={current.rows} />
          {current.rows.length > 50 && (
            <p className="mt-3 text-center text-xs text-ink-400">Showing first 50 of {current.rows.length} rows — export to download the full report.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ReportTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={<ReceiptText className="h-6 w-6" />} title="No data for this report" description="There are no records in your current scope for this report." />;
  }
  const cols = Object.keys(rows[0]);
  const first = rows[0];
  const rightAlign = (c: string) => {
    const v = first[c];
    return typeof v === 'number' || (typeof v === 'string' && (v.startsWith('₦') || v.endsWith('%')));
  };
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="min-w-full divide-y divide-ink-200/70 text-sm">
        <thead className="bg-ink-50/60">
          <tr>{cols.map((c) => <th key={c} className={classNames('th', rightAlign(c) && 'text-right')}>{c.replace(/_/g, ' ')}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink-200/60 bg-white">
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i} className="hover:bg-ink-50/50">
              {cols.map((c) => (
                <td key={c} className={classNames('td whitespace-nowrap', rightAlign(c) ? 'text-right tabular-nums text-ink-700' : 'text-ink-600')}>{String(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Analytics
// ===========================================================================
export function Analytics() {
  const data = useAppSelector(selectData);
  const ids = useAppSelector(scopedPropertyIds);
  const kpis = useMemo(() => computeKpis(data, ids), [data, ids]);

  const scopedInvoices = useMemo(() => data.invoices.filter((i) => ids.has(i.propertyId) && i.status !== 'cancelled'), [data.invoices, ids]);
  const scopedExpenses = useMemo(() => data.expenses.filter((e) => ids.has(e.propertyId) && (e.status === 'approved' || e.status === 'paid')), [data.expenses, ids]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; billed: number; collected: number; expenses: number }>();
    const get = (m: string) => map.get(m) ?? { month: m, billed: 0, collected: 0, expenses: 0 };
    for (const inv of scopedInvoices) {
      const m = inv.issueDate.slice(0, 7);
      const e = get(m); e.billed += inv.total; e.collected += inv.amountPaid; map.set(m, e);
    }
    for (const ex of scopedExpenses) {
      const m = ex.date.slice(0, 7);
      const e = get(m); e.expenses += ex.amount; map.set(m, e);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-8).map((r) => ({
      ...r, label: dayjs(`${r.month}-01`).format('MMM YY'),
      rate: r.billed > 0 ? +((r.collected / r.billed) * 100).toFixed(1) : 0,
    }));
  }, [scopedInvoices, scopedExpenses]);

  const expenseByCat = useMemo(() => {
    const m = new Map<string, number>();
    scopedExpenses.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([cat, value], i) => ({ name: tc(cat), value, color: PALETTE[i % PALETTE.length] }));
  }, [scopedExpenses]);

  const perfList = useMemo(() => data.properties.filter((p) => ids.has(p.id)).map((p) => propertyPerformance(data, p)), [data, ids]);
  const byNetIncome = useMemo(() => [...perfList].sort((a, b) => b.netIncome - a.netIncome).slice(0, 8)
    .map((p) => ({ name: shortName(p.property.name), collected: p.collected, expenses: p.expenses, net: p.netIncome })), [perfList]);
  const byOccupancy = useMemo(() => [...perfList].sort((a, b) => b.occupancyRate - a.occupancyRate).slice(0, 8)
    .map((p) => ({ name: shortName(p.property.name), rate: +p.occupancyRate.toFixed(0) })), [perfList]);

  const tipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 };
  const axisTick = { fontSize: 12, fill: '#64748b' };

  if (kpis.totalProperties === 0) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Portfolio performance & trends" />
        <SectionCard><EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No data to analyse" description="Once properties are in your scope, analytics will appear here." /></SectionCard>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Portfolio performance & trends" />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected" value={formatCurrency(kpis.collected, { compact: true })} icon={<TrendingUp className="h-5 w-5" />} tone="green" hint={`${formatPercent(kpis.collectionRate)} of billed`} />
        <StatCard label="Outstanding" value={formatCurrency(kpis.outstanding, { compact: true })} icon={<ReceiptText className="h-5 w-5" />} tone="amber" hint={`${formatCurrency(kpis.overdue, { compact: true })} overdue`} />
        <StatCard label="Net income" value={formatCurrency(kpis.netIncome, { compact: true })} icon={<Wallet className="h-5 w-5" />} tone={kpis.netIncome >= 0 ? 'green' : 'red'} hint={`${formatCurrency(kpis.totalExpenses, { compact: true })} expenses`} />
        <StatCard label="Occupancy" value={formatPercent(kpis.occupancyRate)} icon={<DoorOpen className="h-5 w-5" />} tone="blue" hint={`${kpis.occupied}/${kpis.occupied + kpis.vacant + kpis.reserved} units`} />
      </div>

      {/* Charts */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Revenue trend" subtitle="Billed vs collected by month" className="lg:col-span-2" bodyClassName="p-3">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="aBilled" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#94a3b8" stopOpacity={0.35} /><stop offset="95%" stopColor="#94a3b8" stopOpacity={0} /></linearGradient>
                  <linearGradient id="aCollected" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.4} /><stop offset="95%" stopColor="#059669" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => formatCurrency(v, { compact: true })} tick={axisTick} tickLine={false} axisLine={false} width={54} />
                <Tooltip formatter={(v: number, n) => [formatCurrency(v), n === 'billed' ? 'Billed' : 'Collected']} contentStyle={tipStyle} />
                <Area type="monotone" dataKey="billed" stroke="#94a3b8" strokeWidth={2} fill="url(#aBilled)" name="billed" />
                <Area type="monotone" dataKey="collected" stroke="#059669" strokeWidth={2.5} fill="url(#aCollected)" name="collected" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Collection rate" subtitle="Collected as % of billed, by month" bodyClassName="p-3">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} width={40} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Collection rate']} contentStyle={tipStyle} />
                <Line type="monotone" dataKey="rate" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Expense breakdown" subtitle="Approved & paid spend by category" bodyClassName="p-3">
          <div className="h-64">
            {expenseByCat.length === 0 ? (
              <div className="flex h-full items-center justify-center"><EmptyState icon={<ReceiptText className="h-6 w-6" />} title="No expenses" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseByCat} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2} stroke="none">
                    {expenseByCat.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n) => [formatCurrency(v), n]} contentStyle={tipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Net income by property" subtitle="Collected less expenses · top 8" className="lg:col-span-2" bodyClassName="p-3">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byNetIncome} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={54} />
                <YAxis tickFormatter={(v) => formatCurrency(v, { compact: true })} tick={axisTick} tickLine={false} axisLine={false} width={54} />
                <Tooltip formatter={(v: number, n) => [formatCurrency(v), tc(String(n))]} contentStyle={tipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="collected" fill="#059669" radius={[4, 4, 0, 0]} name="Collected" />
                <Bar dataKey="expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Occupancy by property" subtitle="Occupied share of rentable units · top 8" className="lg:col-span-2" bodyClassName="p-3">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byOccupancy} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={120} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Occupancy']} contentStyle={tipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {byOccupancy.map((d) => <Cell key={d.name} fill={d.rate >= 80 ? '#059669' : d.rate >= 50 ? '#f59e0b' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-400"><BadgeCheck className="h-3.5 w-3.5" /> Figures reflect your access scope and the active property filter.</p>
    </div>
  );
}
