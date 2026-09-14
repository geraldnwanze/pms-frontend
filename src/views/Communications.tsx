'use client';

import { useMemo, useState } from 'react';
import {
  Megaphone, Plus, Send, MessageSquare, Home, Building2, Globe, UserCog,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, Badge, Avatar, Chip, EmptyState, Modal, Field, Input, Select, Textarea,
} from '@/components/ui';
import { can, ROLE_LABELS } from '@/config/roles';
import { formatDate, formatDateTime, fromNow, uid, classNames } from '@/lib/format';
import type { Notice, Message, User } from '@/types';

// ===========================================================================
// Notices
// ===========================================================================
type Audience = Notice['audience'];
const AUDIENCE_META: Record<Audience, { label: string; icon: React.ReactNode; tone: 'blue' | 'green' | 'purple' | 'gray' }> = {
  all: { label: 'Everyone', icon: <Globe className="h-3.5 w-3.5" />, tone: 'blue' },
  tenants: { label: 'Tenants', icon: <Home className="h-3.5 w-3.5" />, tone: 'green' },
  owners: { label: 'Owners', icon: <Building2 className="h-3.5 w-3.5" />, tone: 'purple' },
  staff: { label: 'Staff', icon: <UserCog className="h-3.5 w-3.5" />, tone: 'gray' },
};
const AUDIENCE_FILTERS: (Audience | 'all-filter')[] = ['all-filter', 'all', 'tenants', 'owners', 'staff'];

export function Notices() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState<Audience | 'all-filter'>('all-filter');
  const [composing, setComposing] = useState(false);

  const all = useMemo(() => data.notices.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.notices]);
  const rows = filter === 'all-filter' ? all : all.filter((n) => n.audience === filter);

  const thisMonth = all.filter((n) => n.createdAt.slice(0, 7) === '2026-08').length;
  const author = (id: string) => data.users.find((u) => u.id === id)?.name ?? 'System';
  const propName = (id?: string) => id ? data.properties.find((p) => p.id === id)?.name : undefined;

  return (
    <div>
      <PageHeader title="Notices & Announcements" subtitle="Broadcast updates to tenants, owners and staff"
        actions={can(user?.role, 'create') ? <button className="btn-primary" onClick={() => setComposing(true)}><Plus className="h-4 w-4" /> Post notice</button> : undefined} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total notices" value={all.length} icon={<Megaphone className="h-5 w-5" />} tone="blue" />
        <StatCard label="Posted in August" value={thisMonth} icon={<Megaphone className="h-5 w-5" />} tone="green" />
        <StatCard label="To tenants" value={all.filter((n) => n.audience === 'tenants').length} icon={<Home className="h-5 w-5" />} tone="purple" />
        <StatCard label="To everyone" value={all.filter((n) => n.audience === 'all').length} icon={<Globe className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {AUDIENCE_FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'all-filter' ? 'All' : AUDIENCE_META[f].label}
            {f !== 'all-filter' && <span className={classNames('ml-1', filter === f ? 'text-white/80' : 'text-ink-400')}>{all.filter((n) => n.audience === f).length}</span>}
          </Chip>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={<Megaphone className="h-6 w-6" />} title="No notices" description="Posted announcements will appear here." /></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((n) => {
            const meta = AUDIENCE_META[n.audience];
            const scope = propName(n.propertyId);
            return (
              <Card key={n.id}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Megaphone className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-ink-800">{n.title}</p>
                      <span className="text-xs text-ink-400">{formatDate(n.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-600">{n.body}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}><span className="flex items-center gap-1">{meta.icon}{meta.label}</span></Badge>
                      {scope && <Badge tone="gray">{scope}</Badge>}
                      <span className="text-xs text-ink-400">by {author(n.createdById)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {composing && <PostNoticeModal onClose={() => setComposing(false)} />}
    </div>
  );
}

function PostNoticeModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const properties = useMemo(() => data.properties.filter((p) => scoped.has(p.id)), [data.properties, scoped]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('tenants');
  const [propertyId, setPropertyId] = useState('');

  const submit = () => {
    if (!title.trim() || !body.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add a title and message.' })); return; }
    dispatch(dataActions.createNotice({ title: title.trim(), body: body.trim(), audience, propertyId: propertyId || undefined, createdById: user!.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Notice posted.' }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Post a notice" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><Send className="h-4 w-4" /> Post notice</button></>}>
      <div className="space-y-4">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled water tank cleaning" /></Field>
        <Field label="Message" required><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write your announcement…" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Audience"><Select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>{(Object.keys(AUDIENCE_META) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_META[a].label}</option>)}</Select></Field>
          <Field label="Property (optional)" hint="Leave blank to target the whole portfolio"><Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Messages (inbox + conversation)
// ===========================================================================
interface Thread { id: string; participants: string[]; messages: Message[]; last: Message; unread: number }

export function Messages() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const dispatch = useAppDispatch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [starting, setStarting] = useState(false);

  const me = user!;
  const isAdmin = me.role === 'admin';
  const userById = (id: string) => data.users.find((u) => u.id === id);

  const threads = useMemo<Thread[]>(() => {
    const relevant = data.messages.filter((m) => isAdmin || m.fromUserId === me.id || m.toUserId === me.id);
    const byThread = new Map<string, Message[]>();
    relevant.forEach((m) => { const arr = byThread.get(m.threadId) ?? []; arr.push(m); byThread.set(m.threadId, arr); });
    return [...byThread.entries()].map(([id, msgs]) => {
      const sorted = msgs.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const participants = [...new Set(msgs.flatMap((m) => [m.fromUserId, m.toUserId]))];
      return { id, participants, messages: sorted, last: sorted[sorted.length - 1], unread: msgs.filter((m) => m.toUserId === me.id && !m.read).length };
    }).sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }, [data.messages, me.id, isAdmin]);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  const counterpartOf = (t: Thread): User | undefined => {
    const otherId = t.participants.find((p) => p !== me.id) ?? t.participants[0];
    return otherId ? userById(otherId) : undefined;
  };
  const iAmParticipant = (t: Thread) => t.participants.includes(me.id);

  const open = (t: Thread) => {
    setSelectedId(t.id);
    if (t.unread) dispatch(dataActions.markThreadRead({ threadId: t.id, userId: me.id }));
  };

  const send = () => {
    if (!draft.trim() || !selected) return;
    const to = selected.participants.find((p) => p !== me.id);
    if (!to) return;
    dispatch(dataActions.sendMessage({ threadId: selected.id, fromUserId: me.id, toUserId: to, body: draft.trim() }));
    setDraft('');
  };

  return (
    <div>
      <PageHeader title="Messages" subtitle={totalUnread ? `${totalUnread} unread ${totalUnread === 1 ? 'message' : 'messages'}` : 'Your conversations'}
        actions={<button className="btn-primary" onClick={() => setStarting(true)}><Plus className="h-4 w-4" /> New message</button>} />

      <Card padded={false} className="overflow-hidden">
        <div className="grid h-[68vh] grid-cols-1 md:grid-cols-[320px_1fr]">
          {/* Thread list */}
          <div className="flex flex-col border-r border-ink-100">
            <div className="border-b border-ink-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Conversations</div>
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-6"><EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No messages" description="Start a conversation to see it here." /></div>
              ) : threads.map((t) => {
                const cp = counterpartOf(t);
                const active = t.id === selectedId;
                return (
                  <button key={t.id} onClick={() => open(t)}
                    className={classNames('flex w-full items-center gap-3 border-b border-ink-50 px-4 py-3 text-left transition-colors', active ? 'bg-brand-50/60' : 'hover:bg-ink-50/50')}>
                    <Avatar name={cp?.name ?? '?'} color={cp?.avatarColor ?? '#64748b'} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={classNames('truncate text-sm', t.unread ? 'font-bold text-ink-900' : 'font-medium text-ink-700')}>{cp?.name ?? 'Unknown'}</p>
                        <span className="shrink-0 text-[11px] text-ink-400">{fromNow(t.last.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className={classNames('truncate text-xs', t.unread ? 'text-ink-600' : 'text-ink-400')}>{t.last.fromUserId === me.id ? 'You: ' : ''}{t.last.body}</p>
                        {t.unread > 0 && <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{t.unread}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conversation */}
          <div className="flex flex-col">
            {!selected ? (
              <div className="flex h-full items-center justify-center p-6"><EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Select a conversation" description="Choose a thread on the left to read and reply." /></div>
            ) : (() => {
              const cp = counterpartOf(selected);
              const canReply = iAmParticipant(selected);
              return (
                <>
                  <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-3">
                    <Avatar name={cp?.name ?? '?'} color={cp?.avatarColor ?? '#64748b'} size={38} />
                    <div><p className="font-semibold text-ink-800">{cp?.name ?? 'Unknown'}</p><p className="text-xs text-ink-400">{cp ? ROLE_LABELS[cp.role] : ''}</p></div>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto bg-ink-50/30 p-5">
                    {selected.messages.map((m) => {
                      const mine = m.fromUserId === me.id;
                      const sender = userById(m.fromUserId);
                      return (
                        <div key={m.id} className={classNames('flex', mine ? 'justify-end' : 'justify-start')}>
                          <div className={classNames('max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm', mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-white text-ink-800')}>
                            {isAdmin && !mine && <p className="mb-0.5 text-[11px] font-semibold text-brand-600">{sender?.name}</p>}
                            <p>{m.body}</p>
                            <p className={classNames('mt-1 text-[10px]', mine ? 'text-white/60' : 'text-ink-400')}>{formatDateTime(m.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 border-t border-ink-100 p-3">
                    {canReply ? (
                      <>
                        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Type a message…" className="flex-1" />
                        <button className="btn-primary" onClick={send}><Send className="h-4 w-4" /></button>
                      </>
                    ) : (
                      <p className="w-full py-1 text-center text-xs text-ink-400">Viewing as administrator — you are not a participant in this conversation.</p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </Card>

      {starting && <NewMessageModal onClose={() => setStarting(false)} onCreated={(tid) => { setSelectedId(tid); setStarting(false); }} />}
    </div>
  );
}

function NewMessageModal({ onClose, onCreated }: { onClose: () => void; onCreated: (threadId: string) => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const me = user!;
  const recipients = useMemo(() => data.users.filter((u) => u.id !== me.id && u.status === 'active').slice().sort((a, b) => a.name.localeCompare(b.name)), [data.users, me.id]);
  const [toId, setToId] = useState(recipients[0]?.id ?? '');
  const [body, setBody] = useState('');

  const submit = () => {
    if (!toId || !body.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Choose a recipient and write a message.' })); return; }
    const threadId = `thr_${[me.id, toId].sort().join('_')}`;
    dispatch(dataActions.sendMessage({ threadId, fromUserId: me.id, toUserId: toId, body: body.trim() }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Message sent.' }));
    onCreated(threadId);
  };

  return (
    <Modal open onClose={onClose} title="New message" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><Send className="h-4 w-4" /> Send</button></>}>
      <div className="space-y-4">
        <Field label="To"><Select value={toId} onChange={(e) => setToId(e.target.value)}>{recipients.map((r) => <option key={r.id} value={r.id}>{r.name} · {ROLE_LABELS[r.role]}</option>)}</Select></Field>
        <Field label="Message" required><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write your message…" /></Field>
      </div>
    </Modal>
  );
}
