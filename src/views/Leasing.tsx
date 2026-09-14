'use client';

import { useMemo, useState } from 'react';
import {
  Megaphone, Tag, CheckCircle2, Users, Eye, Phone, Mail, ArrowRight, CalendarClock,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, StatusBadge, Badge, Money, Chip, EmptyState, ExportMenu,
  Modal, Field, Input, Textarea,
} from '@/components/ui';
import { leadStatusMeta } from '@/lib/status';
import { can } from '@/config/roles';
import { formatDate, TODAY, fromNow, uid, classNames } from '@/lib/format';
import type { Listing, ListingStatus, Lead, LeadStatus } from '@/types';

// ===========================================================================
// Listings
// ===========================================================================
const LISTING_TONE: Record<ListingStatus, 'green' | 'gray' | 'blue' | 'amber'> = { published: 'green', draft: 'amber', let: 'blue', archived: 'gray' };
const LISTING_FILTERS: { key: ListingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'let', label: 'Let' },
  { key: 'archived', label: 'Archived' },
];

export function Listings() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<ListingStatus | 'all'>('all');

  const all = useMemo(() => data.listings.filter((l) => scoped.has(l.propertyId)).slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), [data.listings, scoped]);
  const rows = status === 'all' ? all : all.filter((l) => l.status === status);

  const published = all.filter((l) => l.status === 'published').length;
  const let_ = all.filter((l) => l.status === 'let').length;
  const leadsFor = (id: string) => data.leads.filter((ld) => ld.listingId === id).length;

  const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
  const unitCode = (id: string) => data.units.find((u) => u.id === id)?.code ?? '—';
  const manage = can(user?.role, 'edit');

  const setListingStatus = (l: Listing, s: ListingStatus) => {
    dispatch(dataActions.updateListing({ id: l.id, status: s }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${l.title} → ${s}.` }));
  };

  const exportRows = rows.map((l) => ({ Title: l.title, Property: propName(l.propertyId), Unit: unitCode(l.unitId), Price: l.price, Status: l.status, Leads: leadsFor(l.id), Published: l.publishedAt }));

  return (
    <div>
      <PageHeader title="Listings" subtitle="Advertise vacant units and capture interest"
        actions={<ExportMenu filename="listings" title="Listings" rows={exportRows} size="md" />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Live listings" value={published} icon={<Megaphone className="h-5 w-5" />} tone="green" />
        <StatCard label="Total listings" value={all.length} icon={<Tag className="h-5 w-5" />} tone="blue" />
        <StatCard label="Let" value={let_} icon={<CheckCircle2 className="h-5 w-5" />} tone="purple" />
        <StatCard label="Open leads" value={data.leads.filter((l) => !['converted', 'lost'].includes(l.status)).length} icon={<Users className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {LISTING_FILTERS.map((f) => <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>{f.label}{f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((l) => l.status === f.key).length}</span>}</Chip>)}
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={<Megaphone className="h-6 w-6" />} title="No listings" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l) => {
            const agent = l.agentId ? data.users.find((u) => u.id === l.agentId) : undefined;
            return (
              <Card key={l.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-semibold text-ink-800">{l.title}</p><p className="text-xs text-ink-400">{propName(l.propertyId)} · Unit {unitCode(l.unitId)}</p></div>
                  <Badge tone={LISTING_TONE[l.status]} dot>{l.status}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink-500">{l.description}</p>
                <div className="mt-3 flex items-end justify-between">
                  <Money value={l.price} className="text-xl font-bold text-brand-700" />
                  <span className="text-xs text-ink-400">{leadsFor(l.id)} leads · {fromNow(l.publishedAt)}</span>
                </div>
                {manage && (
                  <div className="mt-3 flex gap-1.5 border-t border-ink-100 pt-3">
                    {l.status !== 'published' && <button className="btn-secondary flex-1 py-1 text-xs" onClick={() => setListingStatus(l, 'published')}>Publish</button>}
                    {l.status === 'published' && <button className="btn-secondary flex-1 py-1 text-xs" onClick={() => setListingStatus(l, 'let')}>Mark let</button>}
                    {l.status !== 'archived' && <button className="btn-secondary py-1 text-xs" onClick={() => setListingStatus(l, 'archived')}>Archive</button>}
                  </div>
                )}
                {agent && <p className="mt-2 text-xs text-ink-400">Listed by {agent.name}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Leads (pipeline board)
// ===========================================================================
const PIPELINE: LeadStatus[] = ['new', 'contacted', 'viewing-scheduled', 'negotiating', 'converted', 'lost'];
const NEXT: Partial<Record<LeadStatus, LeadStatus>> = { new: 'contacted', contacted: 'viewing-scheduled', 'viewing-scheduled': 'negotiating', negotiating: 'converted' };

export function Leads() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [openId, setOpenId] = useState<string | null>(null);

  const leads = useMemo(
    () => data.leads.filter((l) => !l.propertyId || scoped.has(l.propertyId)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.leads, scoped],
  );

  const byStatus = (s: LeadStatus) => leads.filter((l) => l.status === s);
  const converted = byStatus('converted').length;
  const activeLeads = leads.filter((l) => !['converted', 'lost'].includes(l.status)).length;
  const viewings = byStatus('viewing-scheduled').length;
  const rate = leads.length ? Math.round((converted / leads.length) * 100) : 0;

  return (
    <div>
      <PageHeader title="Leads" subtitle="Prospective tenants through your leasing funnel" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active leads" value={activeLeads} icon={<Users className="h-5 w-5" />} tone="blue" />
        <StatCard label="Viewings booked" value={viewings} icon={<Eye className="h-5 w-5" />} tone="amber" />
        <StatCard label="Converted" value={converted} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label="Conversion rate" value={`${rate}%`} icon={<ArrowRight className="h-5 w-5" />} tone="purple" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {PIPELINE.map((s) => {
          const col = byStatus(s);
          const meta = leadStatusMeta(s);
          return (
            <div key={s} className="flex w-64 flex-none flex-col rounded-xl bg-ink-50/70 p-2">
              <div className="mb-2 flex items-center justify-between px-1.5 py-1">
                <StatusBadge meta={meta} dot />
                <span className="text-xs font-medium text-ink-400">{col.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {col.map((l) => (
                  <button key={l.id} onClick={() => setOpenId(l.id)} className="rounded-lg border border-ink-200 bg-white p-2.5 text-left shadow-sm transition-shadow hover:shadow-card-hover">
                    <p className="text-sm font-semibold text-ink-800">{l.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400"><Phone className="h-3 w-3" />{l.phone}</p>
                    {l.viewingDate && <p className="mt-1 flex items-center gap-1 text-xs text-amber-600"><CalendarClock className="h-3 w-3" />{formatDate(l.viewingDate)}</p>}
                  </button>
                ))}
                {col.length === 0 && <p className="px-1.5 py-3 text-center text-xs text-ink-300">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>

      {openId && <LeadModal leadId={openId} onClose={() => setOpenId(null)} canManage={can(user?.role, 'edit')} />}
    </div>
  );
}

function LeadModal({ leadId, onClose, canManage }: { leadId: string; onClose: () => void; canManage: boolean }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const lead = data.leads.find((l) => l.id === leadId);
  const [viewingDate, setViewingDate] = useState(lead?.viewingDate ?? TODAY);
  const [notes, setNotes] = useState(lead?.notes ?? '');
  if (!lead) return null;

  const listing = lead.listingId ? data.listings.find((l) => l.id === lead.listingId) : undefined;
  const agent = lead.agentId ? data.users.find((u) => u.id === lead.agentId) : undefined;
  const next = NEXT[lead.status];

  const update = (changes: Partial<Lead>, msg: string) => {
    dispatch(dataActions.updateLead({ id: lead.id, ...changes }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: msg }));
  };

  return (
    <Modal open onClose={onClose} title={lead.name} subtitle={<StatusBadge meta={leadStatusMeta(lead.status)} />} size="md"
      footer={<div className="flex w-full items-center justify-between">
        <button className="btn-secondary" onClick={onClose}>Close</button>
        {canManage && (
          <div className="flex gap-2">
            {lead.status !== 'lost' && lead.status !== 'converted' && <button className="btn-secondary text-red-600 hover:bg-red-50" onClick={() => { update({ status: 'lost' }, 'Lead marked lost.'); onClose(); }}>Mark lost</button>}
            {next && <button className="btn-primary" onClick={() => { update({ status: next, notes, viewingDate: lead.status === 'contacted' ? viewingDate : lead.viewingDate }, `Advanced to ${leadStatusMeta(next).label}.`); onClose(); }}>Advance → {leadStatusMeta(next).label}</button>}
          </div>
        )}
      </div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-ink-50 p-4 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 text-ink-600"><Phone className="h-4 w-4 text-ink-400" />{lead.phone}</p>
          <p className="flex items-center gap-2 truncate text-ink-600"><Mail className="h-4 w-4 text-ink-400" />{lead.email}</p>
        </div>
        {listing && <div><p className="text-xs uppercase tracking-wide text-ink-400">Interested in</p><p className="text-sm font-medium text-ink-800">{listing.title} · <Money value={listing.price} /></p></div>}
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div><p className="text-xs uppercase tracking-wide text-ink-400">Enquired</p><p className="text-ink-700">{formatDate(lead.createdAt)}</p></div>
          {agent && <div><p className="text-xs uppercase tracking-wide text-ink-400">Agent</p><p className="text-ink-700">{agent.name}</p></div>}
        </div>
        {canManage && (
          <>
            <Field label="Viewing date" hint="Set when scheduling a viewing"><Input type="date" value={viewingDate} onChange={(e) => setViewingDate(e.target.value)} /></Field>
            <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}
