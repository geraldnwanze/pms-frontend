'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import {
  Bell, CreditCard, Wrench, ReceiptText, FileSignature, Megaphone, ClipboardCheck,
  Settings as SettingsIcon, CheckCheck, Inbox,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectNotificationsForCurrentUser } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { fetchNotifications } from '@/store/thunks';
import { PageHeader, Card, EmptyState } from '@/components/ui';
import { classNames, fromNow, formatDateTime } from '@/lib/format';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { AppNotification } from '@/types';

const KIND_META: Record<string, { icon: typeof Bell; tone: string }> = {
  payment: { icon: CreditCard, tone: 'bg-emerald-50 text-emerald-600' },
  rent: { icon: ReceiptText, tone: 'bg-amber-50 text-amber-600' },
  maintenance: { icon: Wrench, tone: 'bg-purple-50 text-purple-600' },
  lease: { icon: FileSignature, tone: 'bg-blue-50 text-blue-600' },
  inspection: { icon: ClipboardCheck, tone: 'bg-cyan-50 text-cyan-600' },
  announcement: { icon: Megaphone, tone: 'bg-brand-50 text-brand-600' },
  system: { icon: SettingsIcon, tone: 'bg-ink-100 text-ink-500' },
};

function metaFor(kind: string) {
  return KIND_META[kind] ?? { icon: Bell, tone: 'bg-ink-100 text-ink-500' };
}

type Filter = 'all' | 'unread';

export function Notifications() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(selectCurrentUser);
  const notifications = useAppSelector(selectNotificationsForCurrentUser);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    void dispatch(fetchNotifications());
  }, [dispatch]);

  const sorted = useMemo(
    () => [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications],
  );
  const unreadCount = sorted.filter((n) => !n.read).length;
  const rows = filter === 'unread' ? sorted.filter((n) => !n.read) : sorted;

  const open = (n: AppNotification) => {
    if (!n.read) dispatch(dataActions.markNotificationRead(n.id));
    if (n.link) navigate(n.link);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
        actions={
          unreadCount > 0 && user ? (
            <button
              className="btn-secondary"
              onClick={() => dispatch(dataActions.markAllNotificationsRead({ userId: user.id, role: user.role }))}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          ) : undefined
        }
      />

      <PushPrompt />

      <div className="mb-4 inline-flex rounded-lg border border-ink-200 bg-white p-0.5 text-sm">
        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterTab>
        <FilterTab active={filter === 'unread'} onClick={() => setFilter('unread')}>
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </FilterTab>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            description="Updates about payments, maintenance, leases and invitations will show up here."
          />
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-ink-100">
            {rows.map((n) => {
              const { icon: Icon, tone } = metaFor(n.kind);
              return (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={classNames(
                      'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-50',
                      !n.read && 'bg-brand-50/40',
                    )}
                  >
                    <span className={classNames('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink-800">{n.title}</span>
                        {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-600">{n.body}</span>
                      <span className="mt-1 block text-xs text-ink-400" title={formatDateTime(n.createdAt)}>
                        {fromNow(n.createdAt)}
                        {n.link && <span className="ml-2 text-brand-600">Open →</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function PushPrompt() {
  const { supported, denied, subscribed, busy, enable } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  if (!supported || denied || subscribed || dismissed) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Bell className="h-4 w-4 text-brand-600" />
        <p className="text-sm text-ink-700">
          Get these on your device — enable browser push notifications.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => void enable()}>Enable</button>
        <button className="btn-ghost text-xs" onClick={() => setDismissed(true)}>Not now</button>
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        'rounded-md px-3 py-1.5 font-medium transition-colors',
        active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900',
      )}
    >
      {children}
    </button>
  );
}
