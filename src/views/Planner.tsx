'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import {
  CheckSquare, Plus, Flag, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, Eye,
  FileText, Wrench, Wallet, CircleDot,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, SectionCard, StatCard, Badge, Avatar, EmptyState, Chip, Modal, Field, Input, Select,
} from '@/components/ui';
import { can } from '@/config/roles';
import { formatDate, TODAY, daysUntil, uid, classNames } from '@/lib/format';
import type { TaskItem, CalendarEvent } from '@/types';

// ===========================================================================
// Tasks
// ===========================================================================
const PRIORITY_TONE: Record<TaskItem['priority'], 'red' | 'amber' | 'gray'> = { high: 'red', medium: 'amber', low: 'gray' };
type TaskFilter = 'open' | 'done' | 'all';

export function Tasks() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [mineOnly, setMineOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => data.tasks.filter((t) => (!t.propertyId || scoped.has(t.propertyId)) && (!mineOnly || t.assignedToId === user?.id)), [data.tasks, scoped, mineOnly, user]);
  const rows = useMemo(() => {
    const list = filter === 'all' ? all : all.filter((t) => (filter === 'done' ? t.done : !t.done));
    return list.slice().sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate));
  }, [all, filter]);

  const open = all.filter((t) => !t.done);
  const overdue = open.filter((t) => daysUntil(t.dueDate) < 0).length;
  const highPr = open.filter((t) => t.priority === 'high').length;

  const propName = (id?: string) => id ? data.properties.find((p) => p.id === id)?.name : undefined;
  const assignee = (id?: string) => id ? data.users.find((u) => u.id === id) : undefined;

  return (
    <div>
      <PageHeader title="Tasks" subtitle="Your team's to-do list"
        actions={can(user?.role, 'create') ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New task</button> : undefined} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={open.length} icon={<CircleDot className="h-5 w-5" />} tone="blue" />
        <StatCard label="Overdue" value={overdue} icon={<CalendarClock className="h-5 w-5" />} tone={overdue ? 'red' : 'gray'} />
        <StatCard label="High priority" value={highPr} icon={<Flag className="h-5 w-5" />} tone={highPr ? 'amber' : 'gray'} />
        <StatCard label="Completed" value={all.filter((t) => t.done).length} icon={<CheckSquare className="h-5 w-5" />} tone="green" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(['open', 'done', 'all'] as TaskFilter[]).map((f) => <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</Chip>)}
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <Chip active={mineOnly} onClick={() => setMineOnly((v) => !v)}>Assigned to me</Chip>
      </div>

      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-6"><EmptyState icon={<CheckSquare className="h-6 w-6" />} title="Nothing here" description={filter === 'open' ? 'No open tasks — nice work.' : 'No tasks match this filter.'} /></div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((t) => {
              const a = assignee(t.assignedToId);
              const od = !t.done && daysUntil(t.dueDate) < 0;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50/50">
                  <button onClick={() => dispatch(dataActions.toggleTask(t.id))} className={classNames('flex h-5 w-5 flex-none items-center justify-center rounded border-2 transition-colors', t.done ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 hover:border-brand-400')}>
                    {t.done && <CheckSquare className="h-3 w-3" strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={classNames('truncate text-sm font-medium', t.done ? 'text-ink-400 line-through' : 'text-ink-800')}>{t.title}</p>
                    <p className="text-xs text-ink-400">{propName(t.propertyId) ?? 'General'}</p>
                  </div>
                  <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                  <span className={classNames('hidden w-28 text-right text-xs sm:block', od ? 'font-semibold text-red-600' : 'text-ink-400')}>{od ? `${Math.abs(daysUntil(t.dueDate))}d overdue` : formatDate(t.dueDate)}</span>
                  {a && <Avatar name={a.name} color={a.avatarColor} size={28} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {creating && <NewTaskModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewTaskModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);
  const staff = useMemo(() => data.users.filter((u) => ['admin', 'manager', 'agent', 'finance', 'maintenance'].includes(u.role)), [data.users]);
  const properties = useMemo(() => data.properties.filter((p) => scoped.has(p.id)), [data.properties, scoped]);

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(TODAY);
  const [priority, setPriority] = useState<TaskItem['priority']>('medium');
  const [assignedToId, setAssignedToId] = useState(staff[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState('');

  const submit = () => {
    if (!title.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add a task title.' })); return; }
    dispatch(dataActions.createTask({ title: title.trim(), dueDate, priority, assignedToId: assignedToId || undefined, propertyId: propertyId || undefined }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Task created.' }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="New task" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Create task</button></>}>
      <div className="space-y-4">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up on overdue rent" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value as TaskItem['priority'])} className="capitalize"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
          <Field label="Assign to"><Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Property (optional)"><Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">General</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Calendar
// ===========================================================================
const KIND_META: Record<CalendarEvent['kind'], { tone: string; icon: React.ReactNode; label: string }> = {
  inspection: { tone: 'bg-cyan-100 text-cyan-700', icon: <ClipboardCheck className="h-3 w-3" />, label: 'Inspection' },
  viewing: { tone: 'bg-amber-100 text-amber-700', icon: <Eye className="h-3 w-3" />, label: 'Viewing' },
  lease: { tone: 'bg-indigo-100 text-indigo-700', icon: <FileText className="h-3 w-3" />, label: 'Lease' },
  maintenance: { tone: 'bg-red-100 text-red-700', icon: <Wrench className="h-3 w-3" />, label: 'Maintenance' },
  payment: { tone: 'bg-green-100 text-green-700', icon: <Wallet className="h-3 w-3" />, label: 'Payment' },
  task: { tone: 'bg-ink-100 text-ink-600', icon: <CheckSquare className="h-3 w-3" />, label: 'Task' },
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function Calendar() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const [cursor, setCursor] = useState(() => { const [y, m] = TODAY.split('-').map(Number); return { y, m: m - 1 }; });
  const [selected, setSelected] = useState(TODAY);

  // Merge seeded events + tasks with due dates
  const events = useMemo<CalendarEvent[]>(() => {
    const taskEvents: CalendarEvent[] = data.tasks.filter((t) => !t.done).map((t) => ({ id: `task-${t.id}`, title: t.title, date: t.dueDate, kind: 'task', refId: t.id }));
    return [...data.events, ...taskEvents];
  }, [data.events, data.tasks]);

  const byDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => { (m[e.date] ??= []).push(e); });
    return m;
  }, [events]);

  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (delta: number) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const selectedEvents = byDate[selected] ?? [];

  const linkFor = (e: CalendarEvent) => {
    switch (e.kind) {
      case 'inspection': return '/inspections';
      case 'viewing': return '/leads';
      case 'lease': return e.refId ? `/leases/${e.refId}` : '/leases';
      case 'maintenance': return e.refId ? `/maintenance/${e.refId}` : '/maintenance';
      case 'payment': return '/payments';
      case 'task': return '/tasks';
      default: return undefined;
    }
  };

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Inspections, viewings, lease events and deadlines" />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink-900">{MONTHS[cursor.m]} {cursor.y}</h2>
              <div className="flex items-center gap-1">
                <button className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
                <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100" onClick={() => { const [y, m] = TODAY.split('-').map(Number); setCursor({ y, m: m - 1 }); setSelected(TODAY); }}>Today</button>
                <button className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => <div key={w} className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{w}</div>)}
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />;
                const ds = ymd(cursor.y, cursor.m, d);
                const evs = byDate[ds] ?? [];
                const isToday = ds === TODAY;
                const isSel = ds === selected;
                return (
                  <button key={i} onClick={() => setSelected(ds)}
                    className={classNames('flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition-colors', isSel ? 'border-brand-400 bg-brand-50/40' : 'border-transparent hover:bg-ink-50')}>
                    <span className={classNames('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', isToday ? 'bg-brand-600 text-white' : 'text-ink-600')}>{d}</span>
                    <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                      {evs.slice(0, 2).map((e) => <span key={e.id} className={classNames('truncate rounded px-1 py-0.5 text-[10px] font-medium', KIND_META[e.kind].tone)}>{e.title}</span>)}
                      {evs.length > 2 && <span className="px-1 text-[10px] text-ink-400">+{evs.length - 2} more</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <SectionCard title={formatDate(selected)} subtitle={`${selectedEvents.length} ${selectedEvents.length === 1 ? 'event' : 'events'}`}>
            {selectedEvents.length === 0 ? <EmptyState title="No events" description="Nothing scheduled for this day." /> : (
              <div className="space-y-2">
                {selectedEvents.map((e) => {
                  const link = linkFor(e);
                  return (
                    <button key={e.id} onClick={() => link && navigate(link)} disabled={!link}
                      className={classNames('flex w-full items-center gap-3 rounded-lg border border-ink-200 p-2.5 text-left', link && 'transition-colors hover:border-brand-300 hover:bg-brand-50/30')}>
                      <span className={classNames('flex h-8 w-8 flex-none items-center justify-center rounded-lg', KIND_META[e.kind].tone)}>{KIND_META[e.kind].icon}</span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink-800">{e.title}</p><p className="text-xs capitalize text-ink-400">{KIND_META[e.kind].label}</p></div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Legend">
            <div className="flex flex-wrap gap-2">
              {Object.entries(KIND_META).map(([k, meta]) => <span key={k} className={classNames('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', meta.tone)}>{meta.icon}{meta.label}</span>)}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
