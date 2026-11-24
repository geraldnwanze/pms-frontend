'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import {
  Wrench, Plus, AlertTriangle, Clock, CheckCircle2, ArrowLeft, User, Building2, Coins,
  PlayCircle, ClipboardCheck, Lock, CircleDot, ClipboardList, ShieldCheck, Search, Package,
  HandCoins, ThumbsUp, Landmark,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, selectModuleOn, scopedPropertyIds, payoutForMaintenance } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  confirmMaintenanceDone, requestMaintenancePayout, approveMaintenancePayout,
  rejectMaintenancePayout, payMaintenancePayout,
} from '@/store/thunks';
import {
  PageHeader, Breadcrumbs, Card, SectionCard, StatCard, StatusBadge, Badge, Money, KeyValue, Avatar,
  EmptyState, DataTable, type Column, Chip, ExportMenu, Modal, Field, Input, Select, Textarea,
} from '@/components/ui';
import { maintenanceStatusMeta, urgencyMeta, payoutStatusMeta } from '@/lib/status';
import { can, isAdminRole } from '@/config/roles';
import { formatDate, formatDateTime, fromNow, uid, classNames, today } from '@/lib/format';
import type {
  MaintenanceRequest, MaintenanceStatus, MaintenanceUrgency, MaintenanceRound, MaintenanceRoundStage,
  MaintenancePayout, PropertyMember,
} from '@/types';
import { api } from '@/lib/api';

const CATEGORIES = ['Plumbing', 'Electrical', 'HVAC', 'Appliance', 'Structural', 'Pest control', 'Security', 'Cleaning', 'Other'];
const URGENCIES: MaintenanceUrgency[] = ['low', 'medium', 'high', 'emergency'];
const STATUS_ORDER: MaintenanceStatus[] = ['open', 'assigned', 'in-progress', 'completed', 'tenant-confirmed', 'verified', 'closed'];
const STATUS_FILTERS: { key: MaintenanceStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'verified', label: 'Verified' },
  { key: 'closed', label: 'Closed' },
];

const ROUND_META: Record<MaintenanceRoundStage, { label: string; blurb: string; icon: React.ReactNode }> = {
  triage: { label: 'Triage round', blurb: 'After the complaint — confirm the issue and its severity', icon: <Search className="h-4 w-4" /> },
  progress: { label: 'In-progress round', blurb: 'During the repair — track cost and quality of work', icon: <Wrench className="h-4 w-4" /> },
  final: { label: 'Post-repair round', blurb: 'After the repair — confirm work done and materials match spec', icon: <ShieldCheck className="h-4 w-4" /> },
};
const ROUND_ORDER: MaintenanceRoundStage[] = ['triage', 'progress', 'final'];

/** The round stage most relevant to the current work-order status. */
function suggestedStage(status: MaintenanceStatus): MaintenanceRoundStage {
  if (status === 'open' || status === 'assigned') return 'triage';
  if (status === 'in-progress') return 'progress';
  return 'final';
}

// ===========================================================================
// List
// ===========================================================================
export function Maintenance() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [status, setStatus] = useState<MaintenanceStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);

  const all = useMemo(
    () => data.maintenance.filter((m) => scoped.has(m.propertyId)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.maintenance, scoped],
  );
  const rows = status === 'all' ? all : all.filter((m) => m.status === status);

  const open = all.filter((m) => m.status === 'open').length;
  const inProgress = all.filter((m) => ['assigned', 'in-progress'].includes(m.status)).length;
  const urgent = all.filter((m) => ['high', 'emergency'].includes(m.urgency) && !['verified', 'closed'].includes(m.status)).length;
  const totalCost = all.reduce((s, m) => s + m.materialsCost + m.labourCost, 0);

  const unitCode = (id: string) => data.units.find((u) => u.id === id)?.code ?? '—';
  const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
  const staffName = (id?: string) => id ? (data.users.find((u) => u.id === id)?.name ?? data.vendors.find((v) => v.id === id)?.name ?? '—') : undefined;

  const exportRows = rows.map((m) => ({
    Code: m.code, Issue: m.title, Property: propName(m.propertyId), Unit: unitCode(m.unitId),
    Category: m.category, Urgency: m.urgency, Status: m.status, Reported: m.createdAt, Cost: m.materialsCost + m.labourCost,
  }));

  const columns: Column<MaintenanceRequest>[] = [
    { key: 'title', header: 'Issue', sortValue: (m) => m.title, render: (m) => <div><p className="font-semibold text-ink-800">{m.title}</p><p className="text-xs text-ink-400">{m.code} · {m.category}</p></div> },
    { key: 'loc', header: 'Location', sortValue: (m) => propName(m.propertyId), render: (m) => <div><p className="text-sm text-ink-700">Unit {unitCode(m.unitId)}</p><p className="text-xs text-ink-400">{propName(m.propertyId)}</p></div> },
    { key: 'urgency', header: 'Urgency', sortValue: (m) => URGENCIES.indexOf(m.urgency), render: (m) => <StatusBadge meta={urgencyMeta(m.urgency)} /> },
    { key: 'assigned', header: 'Assigned', sortValue: (m) => staffName(m.assignedToId ?? m.vendorId) ?? 'z', render: (m) => { const n = staffName(m.assignedToId ?? m.vendorId); return n ? <span className="text-ink-600">{n}</span> : <span className="text-ink-300">Unassigned</span>; } },
    { key: 'date', header: 'Reported', sortValue: (m) => m.createdAt, render: (m) => <span className="text-ink-600">{formatDate(m.createdAt)}</span> },
    { key: 'status', header: 'Status', sortValue: (m) => STATUS_ORDER.indexOf(m.status), render: (m) => <StatusBadge meta={maintenanceStatusMeta(m.status)} /> },
  ];

  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Work orders across your portfolio"
        actions={<>
          <ExportMenu filename="maintenance" title="Maintenance" rows={exportRows} size="md" />
          {can(user?.role, 'create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Log request</button>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={open} icon={<CircleDot className="h-5 w-5" />} tone={open ? 'amber' : 'gray'} onClick={open ? () => setStatus('open') : undefined} />
        <StatCard label="In progress" value={inProgress} icon={<Clock className="h-5 w-5" />} tone="blue" />
        <StatCard label="Urgent open" value={urgent} icon={<AlertTriangle className="h-5 w-5" />} tone={urgent ? 'red' : 'gray'} />
        <StatCard label="Repair spend" value={<Money value={totalCost} compact />} icon={<Coins className="h-5 w-5" />} tone="purple" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}{f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((m) => m.status === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(m) => m.id} onRowClick={(m) => navigate(`/maintenance/${m.id}`)}
          searchable searchAccessor={(m) => `${m.code} ${m.title} ${m.category} ${unitCode(m.unitId)}`} searchPlaceholder="Search work orders…"
          initialSort={{ key: 'date', dir: 'desc' }} />
      </Card>

      {creating && <LogRequestModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function LogRequestModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);
  const units = useMemo(() => data.units.filter((u) => scoped.has(u.propertyId)), [data.units, scoped]);

  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [urgency, setUrgency] = useState<MaintenanceUrgency>('medium');
  const [description, setDescription] = useState('');

  const submit = () => {
    const unit = data.units.find((u) => u.id === unitId);
    if (!unit) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select a unit.' })); return; }
    if (!title.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add a short title.' })); return; }
    const lease = data.leases.find((l) => l.unitId === unit.id && ['active', 'expiring', 'renewed'].includes(l.status));
    const action = dispatch(dataActions.createMaintenance({ propertyId: unit.propertyId, unitId: unit.id, tenantId: lease?.tenantId, title: title.trim(), category, urgency, description, photos: [] }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Work order logged.' }));
    onClose();
    navigate(`/maintenance/${(action.payload as { id: string }).id}`);
  };

  return (
    <Modal open onClose={onClose} title="Log a work order" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Log request</button></>}>
      <div className="space-y-4">
        <Field label="Unit"><Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => { const p = data.properties.find((x) => x.id === u.propertyId); return <option key={u.id} value={u.id}>Unit {u.code} · {p?.name}</option>; })}</Select></Field>
        <Field label="Issue title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking kitchen tap" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Urgency"><Select value={urgency} onChange={(e) => setUrgency(e.target.value as MaintenanceUrgency)} className="capitalize">{URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
        </div>
        <Field label="Details"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></Field>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Detail
// ===========================================================================
export function MaintenanceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [assigning, setAssigning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loggingRound, setLoggingRound] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [payingPayout, setPayingPayout] = useState(false);
  const payoutsOn = useAppSelector(selectModuleOn('payouts'));

  const m = data.maintenance.find((x) => x.id === id);

  if (!m) {
    return <div><PageHeader title="Work order not found" /><Card><EmptyState icon={<Wrench className="h-6 w-6" />} title="This request doesn't exist" action={<button className="btn-primary" onClick={() => navigate('/maintenance')}><ArrowLeft className="h-4 w-4" /> Back</button>} /></Card></div>;
  }

  const property = data.properties.find((p) => p.id === m.propertyId);
  const unit = data.units.find((u) => u.id === m.unitId);
  const tenant = m.tenantId ? data.tenants.find((t) => t.id === m.tenantId) : undefined;
  const assignee = m.assignedToId ? data.users.find((u) => u.id === m.assignedToId) : undefined;
  const vendor = m.vendorId ? data.vendors.find((v) => v.id === m.vendorId) : undefined;
  const totalCost = m.materialsCost + m.labourCost;
  const canEdit = can(user?.role, 'edit');
  const canApprove = can(user?.role, 'approve');
  // Assigning a technician is a manager/owner/admin decision — not the tech's.
  const canAssign = isAdminRole(user?.role) || ['owner', 'manager'].includes(user?.role ?? '');
  const stepIdx = STATUS_ORDER.indexOf(m.status);

  const payout = payoutForMaintenance(data, m.id);
  const isAssignedTech = !!user && user.id === m.assignedToId;
  const canTenantConfirm =
    user?.role === 'tenant' && !!user.tenantId && m.tenantId === user.tenantId && m.status === 'completed';
  const canRequestPayout =
    payoutsOn && isAssignedTech && ['tenant-confirmed', 'verified', 'closed'].includes(m.status) && !payout;
  const canActOnPayout = isAdminRole(user?.role) || ['owner', 'manager', 'finance'].includes(user?.role ?? '');

  const advance = (status: MaintenanceStatus, changes: Partial<MaintenanceRequest> = {}) => {
    dispatch(dataActions.updateMaintenance({ id: m.id, actorId: user!.id, changes: { status, ...changes } }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${m.code} → ${maintenanceStatusMeta(status).label}.` }));
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[
          { label: 'Maintenance', to: '/maintenance' },
          { label: property?.name ?? 'Property', to: property ? `/properties/${property.id}` : undefined },
          { label: `Unit ${unit?.code ?? ''}`, to: unit ? `/units/${unit.id}` : undefined },
          { label: m.code },
        ]} />}
        title={<span className="flex items-center gap-2.5">{m.title}<StatusBadge meta={maintenanceStatusMeta(m.status)} /></span>}
        subtitle={`${m.code} · ${m.category}`}
        actions={<div className="flex items-center gap-2">
          <StatusBadge meta={urgencyMeta(m.urgency)} />
          {(canEdit || canApprove) && !['closed'].includes(m.status) && <button className="btn-secondary" onClick={() => setLoggingRound(true)}><ClipboardList className="h-4 w-4" /> Log round</button>}
          {canAssign && m.status === 'open' && <button className="btn-primary" onClick={() => setAssigning(true)}><User className="h-4 w-4" /> Assign</button>}
          {canAssign && m.status === 'assigned' && <button className="btn-secondary" onClick={() => setAssigning(true)}><User className="h-4 w-4" /> Reassign</button>}
          {canEdit && m.status === 'assigned' && <button className="btn-primary" onClick={() => advance('in-progress')}><PlayCircle className="h-4 w-4" /> Start work</button>}
          {canEdit && m.status === 'in-progress' && <button className="btn-primary" onClick={() => setCompleting(true)}><CheckCircle2 className="h-4 w-4" /> Mark complete</button>}
          {canTenantConfirm && <button className="btn-primary" onClick={() => dispatch(confirmMaintenanceDone(m.id))}><ThumbsUp className="h-4 w-4" /> Confirm work done</button>}
          {canRequestPayout && <button className="btn-primary" onClick={() => setRequestingPayout(true)}><HandCoins className="h-4 w-4" /> Request payment</button>}
          {canApprove && m.status === 'tenant-confirmed' && <button className="btn-primary" onClick={() => setVerifying(true)}><ClipboardCheck className="h-4 w-4" /> Verify work</button>}
          {canApprove && m.status === 'verified' && <button className="btn-secondary" onClick={() => advance('closed')}><Lock className="h-4 w-4" /> Close</button>}
        </div>} />

      {/* Status stepper */}
      <Card className="mb-5">
        <div className="flex items-center justify-between overflow-x-auto">
          {STATUS_ORDER.map((s, i) => {
            const done = i < stepIdx;
            const current = i === stepIdx;
            return (
              <div key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <span className={classNames('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2', done ? 'bg-brand-600 text-white ring-brand-600' : current ? 'bg-white text-brand-700 ring-brand-500' : 'bg-white text-ink-300 ring-ink-200')}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className={classNames('whitespace-nowrap text-[11px] font-medium capitalize', current ? 'text-brand-700' : done ? 'text-ink-600' : 'text-ink-300')}>{maintenanceStatusMeta(s).label}</span>
                </div>
                {i < STATUS_ORDER.length - 1 && <div className={classNames('mx-2 h-0.5 flex-1', done ? 'bg-brand-500' : 'bg-ink-100')} />}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Description">
            <p className="text-sm leading-relaxed text-ink-600">{m.description || 'No description provided.'}</p>
          </SectionCard>

          <div className="grid gap-5 sm:grid-cols-2">
            <SectionCard title="Before">
              {m.photos.length ? <div className="grid grid-cols-3 gap-2">{m.photos.map((p, i) => <div key={i} className="aspect-square rounded-lg" style={{ background: p }} />)}</div> : <EmptyState title="No photos" />}
            </SectionCard>
            <SectionCard title="After">
              {m.afterPhotos.length ? <div className="grid grid-cols-3 gap-2">{m.afterPhotos.map((p, i) => <div key={i} className="aspect-square rounded-lg" style={{ background: p }} />)}</div> : <EmptyState title="Pending completion" />}
            </SectionCard>
          </div>

          <SectionCard title="Maintenance rounds"
            action={(canEdit || canApprove) && m.status !== 'closed' ? <button className="btn-ghost text-sm text-brand-600" onClick={() => setLoggingRound(true)}><Plus className="h-4 w-4" /> Log round</button> : undefined}>
            <RoundsTimeline rounds={m.rounds ?? []} data={data} />
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Assignment">
            {assignee || vendor ? (
              <div className="space-y-3">
                {assignee && <div className="flex items-center gap-3"><Avatar name={assignee.name} color={assignee.avatarColor} size={36} /><div><p className="font-semibold text-ink-800">{assignee.name}</p><p className="text-xs text-ink-400">In-house · {assignee.title ?? 'Maintenance'}</p></div></div>}
                {vendor && <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600"><Building2 className="h-4 w-4" /></span><div><p className="font-semibold text-ink-800">{vendor.name}</p><p className="text-xs text-ink-400">Vendor · {vendor.service}</p></div></div>}
              </div>
            ) : <EmptyState title="Unassigned" description={canAssign ? 'Assign a technician or vendor to begin.' : 'A manager will assign this shortly.'} />}
          </SectionCard>

          {payoutsOn && <PayoutCard
            payout={payout}
            request={m}
            data={data}
            isAssignedTech={isAssignedTech}
            canActOnPayout={canActOnPayout}
            canRequest={canRequestPayout}
            onRequest={() => setRequestingPayout(true)}
            onApprove={() => payout && dispatch(approveMaintenancePayout(payout.id))}
            onReject={(reason) => payout && dispatch(rejectMaintenancePayout(payout.id, reason))}
            onPay={() => setPayingPayout(true)}
          />}

          <SectionCard title="Costs">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-ink-500">Materials</span><Money value={m.materialsCost} className="font-medium text-ink-800" /></div>
              <div className="flex items-center justify-between"><span className="text-ink-500">Labour</span><Money value={m.labourCost} className="font-medium text-ink-800" /></div>
              <div className="flex items-center justify-between border-t border-ink-100 pt-2"><span className="font-semibold text-ink-700">Total</span><Money value={totalCost} className="font-bold text-brand-700" /></div>
            </div>
          </SectionCard>

          <SectionCard title="Materials">
            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400"><Package className="h-3.5 w-3.5" /> Specified</p>
                <p className="text-ink-600">{m.specifiedMaterials || <span className="text-ink-300">Not specified yet</span>}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Actually used</p>
                <p className="text-ink-600">{m.actualMaterials || <span className="text-ink-300">Recorded at completion</span>}</p>
              </div>
              {m.materialsMatch !== undefined && (
                <div className={classNames('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', m.materialsMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                  {m.materialsMatch ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {m.materialsMatch ? 'Materials match specification' : 'Materials do not match specification'}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Details">
            <dl>
              {tenant && <KeyValue label="Reported by"><button className="text-brand-600 hover:underline" onClick={() => navigate(`/tenants/${tenant.id}`)}>{tenant.name}</button></KeyValue>}
              <KeyValue label="Reported">{formatDateTime(m.createdAt)} · {fromNow(m.createdAt)}</KeyValue>
              {m.completedAt && <KeyValue label="Completed">{formatDateTime(m.completedAt)}</KeyValue>}
              {m.closedAt && <KeyValue label="Closed">{formatDateTime(m.closedAt)}</KeyValue>}
              <KeyValue label="Category"><Badge tone="gray">{m.category}</Badge></KeyValue>
            </dl>
          </SectionCard>
        </div>
      </div>

      {assigning && <AssignModal request={m} onClose={() => setAssigning(false)} onAssign={(changes) => { advance('assigned', changes); setAssigning(false); }} />}
      {completing && <CompleteModal request={m} onClose={() => setCompleting(false)} onComplete={(changes) => { advance('completed', changes); setCompleting(false); }} />}
      {verifying && <VerifyModal request={m} onClose={() => setVerifying(false)} onVerify={(changes) => { advance('verified', changes); setVerifying(false); }} />}
      {loggingRound && <RoundModal request={m} onClose={() => setLoggingRound(false)} />}
      {requestingPayout && (
        <RequestPayoutModal
          request={m}
          onClose={() => setRequestingPayout(false)}
          onSubmit={(body) => { dispatch(requestMaintenancePayout(m.id, body)); setRequestingPayout(false); }}
        />
      )}
      {payingPayout && payout && (
        <PayPayoutModal
          payout={payout}
          onClose={() => setPayingPayout(false)}
          onSubmit={(body) => { dispatch(payMaintenancePayout(payout.id, body)); setPayingPayout(false); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technician payout
// ---------------------------------------------------------------------------
function PayoutCard({
  payout, request, data, isAssignedTech, canActOnPayout, canRequest, onRequest, onApprove, onReject, onPay,
}: {
  payout?: MaintenancePayout;
  request: MaintenanceRequest;
  data: ReturnType<typeof selectData>;
  isAssignedTech: boolean;
  canActOnPayout: boolean;
  canRequest: boolean;
  onRequest: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onPay: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  if (!payout) {
    // Nothing requested yet — only show the card once a payout is possible.
    if (!['tenant-confirmed', 'verified', 'closed'].includes(request.status)) return null;
    return (
      <SectionCard title="Technician payment">
        <EmptyState
          icon={<HandCoins className="h-6 w-6" />}
          title="No payment requested"
          description={canRequest ? 'You can request payment for this job.' : isAssignedTech ? undefined : 'The technician has not requested payment yet.'}
        />
        {canRequest && <button className="btn-primary mt-3 w-full" onClick={onRequest}><HandCoins className="h-4 w-4" /> Request payment</button>}
      </SectionCard>
    );
  }

  const staff = data.users.find((u) => u.id === payout.staffId);
  const approver = data.users.find((u) => u.id === payout.approvedById);

  return (
    <SectionCard
      title="Technician payment"
      action={<StatusBadge meta={payoutStatusMeta(payout.status)} />}
    >
      <div className="rounded-xl bg-gradient-to-br from-ink-50 to-ink-100 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{payout.code}</p>
        <Money value={payout.amount} className="mt-0.5 text-2xl font-extrabold text-ink-900" />
        {(payout.materialsAmount || payout.labourAmount) && (
          <p className="mt-1 text-xs text-ink-500">
            {payout.materialsAmount ? `Materials ₦${payout.materialsAmount.toLocaleString('en-NG')}` : ''}
            {payout.materialsAmount && payout.labourAmount ? ' · ' : ''}
            {payout.labourAmount ? `Labour ₦${payout.labourAmount.toLocaleString('en-NG')}` : ''}
          </p>
        )}
      </div>

      {staff && <p className="mt-3 text-sm text-ink-600">For <span className="font-semibold text-ink-800">{staff.name}</span></p>}
      {payout.note && <p className="mt-1 rounded-lg bg-ink-50 p-2.5 text-sm text-ink-600">“{payout.note}”</p>}

      {payout.bankAccountNumber ? (
        <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/60 p-2.5 text-xs">
          <p className="flex items-center gap-1.5 font-semibold text-ink-600"><Landmark className="h-3.5 w-3.5" /> Payout account</p>
          <p className="mt-1 text-ink-700">
            {payout.bankAccountName ?? staff?.name} · {payout.bankName ?? '—'} · {payout.bankAccountNumber}
            {payout.bankCode ? ` (${payout.bankCode})` : ''}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
          {isAssignedTech
            ? 'No payout account on file for your membership on this property. Add it under Invitations → Your memberships so you can be paid.'
            : 'The technician has not added a payout bank account for this property yet.'}
        </p>
      )}

      <dl className="mt-3 space-y-1.5 border-t border-ink-100 pt-2 text-xs">
        {payout.requestedAt && <div className="flex justify-between"><dt className="text-ink-400">Requested</dt><dd className="text-ink-600">{formatDate(payout.requestedAt)}</dd></div>}
        {payout.status === 'approved' && payout.approvedAt && <div className="flex justify-between"><dt className="text-ink-400">Approved by {approver?.name ?? '—'}</dt><dd className="text-ink-600">{formatDate(payout.approvedAt)}</dd></div>}
        {payout.status === 'rejected' && <div className="flex justify-between"><dt className="text-red-500">Rejected</dt><dd className="text-ink-600">{payout.rejectedReason}</dd></div>}
        {payout.status === 'paid' && <div className="flex justify-between"><dt className="text-brand-600">Paid {payout.paymentMethod ? `· ${payout.paymentMethod.replace('-', ' ')}` : ''}</dt><dd className="text-ink-600">{payout.paidAt ? formatDate(payout.paidAt) : ''}</dd></div>}
      </dl>

      {canActOnPayout && payout.status === 'requested' && !rejecting && (
        <div className="mt-3 flex gap-2">
          <button className="btn-secondary flex-1 text-red-600" onClick={() => setRejecting(true)}>Reject</button>
          <button className="btn-primary flex-1" onClick={onApprove}><CheckCircle2 className="h-4 w-4" /> Approve</button>
        </div>
      )}
      {canActOnPayout && payout.status === 'requested' && rejecting && (
        <div className="mt-3 space-y-2">
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejecting this payout…" />
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
            <button className="btn-danger flex-1" disabled={reason.trim().length < 3} onClick={() => { onReject(reason.trim()); setRejecting(false); setReason(''); }}>Confirm reject</button>
          </div>
        </div>
      )}
      {canActOnPayout && payout.status === 'approved' && (
        <button className="btn-primary mt-3 w-full" onClick={onPay}><Coins className="h-4 w-4" /> Mark as paid</button>
      )}
    </SectionCard>
  );
}

function RequestPayoutModal({ request, onClose, onSubmit }: {
  request: MaintenanceRequest;
  onClose: () => void;
  onSubmit: (body: { amount?: number; note?: string }) => void;
}) {
  const suggested = request.materialsCost + request.labourCost;
  const [amount, setAmount] = useState(suggested || 0);
  const [note, setNote] = useState('');

  return (
    <Modal open onClose={onClose} title="Request payment" subtitle={`${request.code} · ${request.title}`} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={amount <= 0} onClick={() => onSubmit({ amount: Math.round(amount), note: note.trim() || undefined })}>
          <HandCoins className="h-4 w-4" /> Send request
        </button></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
          Recorded costs: materials ₦{request.materialsCost.toLocaleString('en-NG')} · labour ₦{request.labourCost.toLocaleString('en-NG')}.
        </div>
        <Field label="Amount you're owed (₦)" required>
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Breakdown, receipts, anything the payer should know" />
        </Field>
      </div>
    </Modal>
  );
}

const PAYOUT_METHODS = ['bank-transfer', 'cash'] as const;

function PayPayoutModal({ payout, onClose, onSubmit }: {
  payout: MaintenancePayout;
  onClose: () => void;
  onSubmit: (body: { method?: string; reference?: string }) => void;
}) {
  const [method, setMethod] = useState<string>('bank-transfer');
  const [reference, setReference] = useState('');

  return (
    <Modal open onClose={onClose} title="Mark payout as paid" subtitle={`${payout.code} · ₦${payout.amount.toLocaleString('en-NG')}`} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => onSubmit({ method, reference: reference.trim() || undefined })}>
          <Coins className="h-4 w-4" /> Confirm payment
        </button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-500">This records the payout and books a matching expense against the property. Bank transfer via Paystack can be wired here later.</p>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)} className="capitalize">
            {PAYOUT_METHODS.map((x) => <option key={x} value={x}>{x.replace('-', ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Reference (optional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer reference / receipt no." />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Maintenance rounds timeline
// ---------------------------------------------------------------------------
function RoundsTimeline({ rounds, data }: { rounds: MaintenanceRound[]; data: ReturnType<typeof selectData> }) {
  if (!rounds.length) {
    return <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No rounds recorded yet" description="Log a triage round to confirm the issue, then follow up during and after the repair." />;
  }
  const byName = (id: string) => data.users.find((u) => u.id === id)?.name ?? data.vendors.find((v) => v.id === id)?.name ?? 'Staff';
  const ordered = rounds.slice().sort((a, b) => ROUND_ORDER.indexOf(a.stage) - ROUND_ORDER.indexOf(b.stage) || a.date.localeCompare(b.date));
  return (
    <ol className="space-y-4">
      {ordered.map((r) => {
        const meta = ROUND_META[r.stage];
        return (
          <li key={r.id} className="flex gap-3">
            <span className={classNames('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', r.outcome === 'ok' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>{meta.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink-800">{meta.label}</p>
                <Badge tone={r.outcome === 'ok' ? 'green' : 'amber'}>{r.outcome === 'ok' ? 'No issues' : 'Issues flagged'}</Badge>
                <span className="text-xs text-ink-400">{formatDate(r.date)}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-400">{meta.blurb}</p>
              <p className="mt-1.5 text-sm text-ink-600">{r.findings}</p>
              <p className="mt-1 text-xs text-ink-400">by {byName(r.byId)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RoundModal({ request, onClose }: { request: MaintenanceRequest; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const [stage, setStage] = useState<MaintenanceRoundStage>(suggestedStage(request.status));
  const [outcome, setOutcome] = useState<MaintenanceRound['outcome']>('ok');
  const [findings, setFindings] = useState('');

  const submit = () => {
    if (!findings.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add what you found on this round.' })); return; }
    dispatch(dataActions.addMaintenanceRound({ id: request.id, actorId: user!.id, round: { stage, date: today(), byId: user!.id, outcome, findings: findings.trim() } }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${ROUND_META[stage].label} recorded.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Log a maintenance round" subtitle={request.title} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><ClipboardList className="h-4 w-4" /> Record round</button></>}>
      <div className="space-y-4">
        <Field label="Round type">
          <div className="grid gap-2">
            {ROUND_ORDER.map((s) => (
              <button key={s} onClick={() => setStage(s)}
                className={classNames('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', stage === s ? 'border-brand-500 bg-brand-50/50' : 'border-ink-200 hover:bg-ink-50')}>
                <span className={classNames('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', stage === s ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>{ROUND_META[s].icon}</span>
                <div><p className="text-sm font-semibold text-ink-800">{ROUND_META[s].label}</p><p className="text-xs text-ink-400">{ROUND_META[s].blurb}</p></div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Outcome">
          <div className="flex gap-2">
            <Chip active={outcome === 'ok'} onClick={() => setOutcome('ok')}>No issues</Chip>
            <Chip active={outcome === 'issues'} onClick={() => setOutcome('issues')}>Issues flagged</Chip>
          </div>
        </Field>
        <Field label="Findings" required><Textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} placeholder="What did you observe on this round?" /></Field>
      </div>
    </Modal>
  );
}

function VerifyModal({ request, onClose, onVerify }: { request: MaintenanceRequest; onClose: () => void; onVerify: (changes: Partial<MaintenanceRequest>) => void }) {
  const [materialsMatch, setMaterialsMatch] = useState(true);
  return (
    <Modal open onClose={onClose} title="Verify completed work" subtitle={request.title} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onVerify({ materialsMatch })}><ClipboardCheck className="h-4 w-4" /> Confirm verification</button></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-ink-50 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400"><Package className="h-3.5 w-3.5" /> Specified materials</p>
          <p className="text-ink-600">{request.specifiedMaterials || 'Not specified.'}</p>
          <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Materials actually used</p>
          <p className="text-ink-600">{request.actualMaterials || 'Not recorded.'}</p>
        </div>
        <Field label="Do the materials used match what was specified?">
          <div className="flex gap-2">
            <Chip active={materialsMatch} onClick={() => setMaterialsMatch(true)}>Yes, they match</Chip>
            <Chip active={!materialsMatch} onClick={() => setMaterialsMatch(false)}>No, they differ</Chip>
          </div>
        </Field>
        {!materialsMatch && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">This will be flagged on the work order for owner review.</p>}
        <p className="text-xs text-ink-400">Verifying confirms the repair was completed to standard. Consider logging a post-repair round first if you haven't inspected the work.</p>
      </div>
    </Modal>
  );
}

/**
 * Assign a work order. In-house staff are limited to technicians on *this property's* team — the app can
 * see technicians from the owner's other properties too, but the server only accepts people on this one.
 */
export function AssignModal({ request, onClose, onAssign }: { request: MaintenanceRequest; onClose: () => void; onAssign: (changes: Partial<MaintenanceRequest>) => void }) {
  const data = useAppSelector(selectData);
  const vendors = data.vendors;

  const [team, setTeam] = useState<PropertyMember[] | null>(null);
  const [teamFailed, setTeamFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.propertyMembers(request.propertyId)
      .then((rows) => { if (live) setTeam(rows as PropertyMember[]); })
      .catch(() => { if (live) setTeamFailed(true); });
    return () => { live = false; };
  }, [request.propertyId]);

  const staff = useMemo(() => {
    const onTeam = new Set((team ?? []).filter((m) => m.status === 'active' && m.role === 'maintenance' && m.userId).map((m) => m.userId as string));
    return data.users.filter((u) => u.role === 'maintenance' && onTeam.has(u.id));
  }, [team, data.users]);

  const loading = team === null && !teamFailed;
  const [mode, setMode] = useState<'staff' | 'vendor'>('staff');
  const [assignedToId, setAssignedToId] = useState('');
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const [specifiedMaterials, setSpecifiedMaterials] = useState(request.specifiedMaterials ?? '');

  // keep the selection on someone who is actually on the team
  useEffect(() => {
    setAssignedToId((current) => (staff.some((s) => s.id === current) ? current : staff[0]?.id ?? ''));
  }, [staff]);

  const canConfirm = mode === 'staff' ? !!assignedToId : !!vendorId;

  const confirm = () => {
    const spec = specifiedMaterials.trim() || undefined;
    if (mode === 'staff') onAssign({ assignedToId, vendorId: undefined, specifiedMaterials: spec });
    else onAssign({ vendorId, assignedToId: undefined, specifiedMaterials: spec });
  };

  const noStaff = teamFailed
    ? 'We couldn’t load this property’s team. Close this and try again.'
    : 'No technicians are on this property’s team yet. Invite one from the property page, or use an external vendor.';

  return (
    <Modal open onClose={onClose} title="Assign work order" subtitle={request.title} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={confirm} disabled={!canConfirm}>Assign</button></>}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Chip active={mode === 'staff'} onClick={() => setMode('staff')}>In-house staff</Chip>
          <Chip active={mode === 'vendor'} onClick={() => setMode('vendor')}>External vendor</Chip>
        </div>
        {mode === 'staff' ? (
          loading ? <p className="text-sm text-ink-500">Loading this property’s team…</p>
            : staff.length ? <Field label="Technician"><Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}</Select></Field>
              : <p className="text-sm text-ink-500">{noStaff}</p>
        ) : (
          vendors.length ? <Field label="Vendor"><Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.service}</option>)}</Select></Field> : <p className="text-sm text-ink-500">No vendors on file.</p>
        )}
        <Field label="Specified materials" hint="What the owner/manager expects to be used (checked at verification)"><Textarea value={specifiedMaterials} onChange={(e) => setSpecifiedMaterials(e.target.value)} rows={2} placeholder="e.g. OEM parts, 2-year warranty" /></Field>
      </div>
    </Modal>
  );
}

function CompleteModal({ request, onClose, onComplete }: { request: MaintenanceRequest; onClose: () => void; onComplete: (changes: Partial<MaintenanceRequest>) => void }) {
  const [materialsCost, setMaterials] = useState(request.materialsCost || 0);
  const [labourCost, setLabour] = useState(request.labourCost || 0);
  const [actualMaterials, setActualMaterials] = useState(request.actualMaterials ?? '');
  return (
    <Modal open onClose={onClose} title="Mark work complete" subtitle={request.title} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onComplete({ materialsCost: Number(materialsCost), labourCost: Number(labourCost), actualMaterials: actualMaterials.trim() || undefined })}><CheckCircle2 className="h-4 w-4" /> Mark complete</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Materials cost (₦)"><Input type="number" value={materialsCost} onChange={(e) => setMaterials(Number(e.target.value))} /></Field>
        <Field label="Labour cost (₦)"><Input type="number" value={labourCost} onChange={(e) => setLabour(Number(e.target.value))} /></Field>
      </div>
      {request.specifiedMaterials && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500"><span className="font-semibold">Specified:</span> {request.specifiedMaterials}</p>}
      <Field label="Materials actually used" className="mt-3"><Textarea value={actualMaterials} onChange={(e) => setActualMaterials(e.target.value)} rows={2} placeholder="Describe the parts/materials used" /></Field>
      <p className="mt-3 text-xs text-ink-400">Total recorded against this work order: ₦{(Number(materialsCost) + Number(labourCost)).toLocaleString('en-NG')}. It will await verification by a manager.</p>
    </Modal>
  );
}
