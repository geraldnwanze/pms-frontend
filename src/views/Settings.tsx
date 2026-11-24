'use client';

import { useState, useEffect } from 'react';
import {
  Shield, KeyRound, Smartphone, Monitor, Sun, Moon, LogOut, PanelLeftClose, Check, Building2,
  RotateCcw,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { resetDemoData, saveOrganization } from '@/store/thunks';
import { pushToast, toggleSidebarCollapsed, setTheme, type ThemePref } from '@/store/uiSlice';
import {
  PageHeader, Card, SectionCard, Tabs, Field, Input, Select, Avatar, Badge,
} from '@/components/ui';
import { ROLE_LABELS, ROLE_COLORS, isAdminRole } from '@/config/roles';
import { uid, classNames } from '@/lib/format';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { User } from '@/types';

export function Settings() {
  const user = useAppSelector(selectCurrentUser)!;
  const [tab, setTab] = useState('profile');
  const isAdmin = isAdminRole(user.role);

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'security', label: 'Security' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'appearance', label: 'Appearance' },
    ...(isAdmin ? [{ key: 'organization', label: 'Organization' }] : []),
  ];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account, security and preferences" />
      <Tabs className="mb-5" active={tab} onChange={setTab} tabs={tabs} />
      {tab === 'profile' && <ProfileTab user={user} />}
      {tab === 'security' && <SecurityTab user={user} />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'organization' && isAdmin && <OrganizationTab />}
    </div>
  );
}

// ---- Profile ---------------------------------------------------------------
function ProfileTab({ user }: { user: User }) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [title, setTitle] = useState(user.title ?? '');

  const dirty = name !== user.name || email !== user.email || phone !== (user.phone ?? '') || title !== (user.title ?? '');
  const reset = () => { setName(user.name); setEmail(user.email); setPhone(user.phone ?? ''); setTitle(user.title ?? ''); };
  const save = () => {
    if (!name.trim() || !email.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Name and email are required.' })); return; }
    dispatch(dataActions.updateUser({ id: user.id, changes: { name, email, phone: phone || undefined, title: title || undefined }, actorId: user.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Profile updated.' }));
  };

  return (
    <SectionCard title="Profile" subtitle="Your personal details and how you appear to the team">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={name || user.name} color={user.avatarColor} size={64} />
        <div>
          <p className="text-lg font-semibold text-ink-800">{name || user.name}</p>
          <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${ROLE_COLORS[user.role]}1a`, color: ROLE_COLORS[user.role] }}>{ROLE_LABELS[user.role]}</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email address"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" /></Field>
        <Field label="Job title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Portfolio Manager" /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={reset} disabled={!dirty}>Reset</button>
        <button className="btn-primary" onClick={save} disabled={!dirty}>Save changes</button>
      </div>
    </SectionCard>
  );
}

// ---- Security --------------------------------------------------------------
function SecurityTab({ user }: { user: User }) {
  const dispatch = useAppDispatch();
  const [twoFA, setTwoFA] = useState(user.twoFactorEnabled);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  const toggle2FA = (v: boolean) => {
    setTwoFA(v);
    dispatch(dataActions.updateUser({ id: user.id, changes: { twoFactorEnabled: v }, actorId: user.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Two-factor authentication ${v ? 'enabled' : 'disabled'}.` }));
  };
  const changePw = () => {
    if (!pw.current || !pw.next) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Enter your current and new password.' })); return; }
    if (pw.next.length < 8) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'New password must be at least 8 characters.' })); return; }
    if (pw.next !== pw.confirm) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'New passwords do not match.' })); return; }
    setPw({ current: '', next: '', confirm: '' });
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Password updated.' }));
  };

  const sessions = [
    { device: 'Chrome · macOS', location: 'Lagos, NG', ip: '102.89.34.12', current: true },
    { device: 'Safari · iPhone', location: 'Abuja, NG', ip: '197.210.64.9', current: false },
  ];

  return (
    <div className="space-y-5">
      <SectionCard title="Password" subtitle="Choose a strong password you don't use elsewhere">
        <div className="grid max-w-md gap-4">
          <Field label="Current password"><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters."><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Confirm new password"><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <div className="mt-5"><button className="btn-primary" onClick={changePw}><KeyRound className="h-4 w-4" /> Update password</button></div>
      </SectionCard>

      <SectionCard title="Two-factor authentication" subtitle="Add a one-time passcode step when signing in">
        <div className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className={classNames('flex h-10 w-10 items-center justify-center rounded-xl', twoFA ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400')}><Shield className="h-5 w-5" /></span>
            <div><p className="text-sm font-semibold text-ink-800">Authenticator app</p><p className="text-xs text-ink-500">{twoFA ? 'Enabled — you\'ll be asked for a code at sign-in.' : 'Currently disabled.'}</p></div>
          </div>
          <Toggle on={twoFA} onChange={toggle2FA} />
        </div>
      </SectionCard>

      <SectionCard title="Active sessions" subtitle="Devices currently signed in to your account"
        action={<button className="btn-secondary" onClick={() => dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Signed out of all other sessions.' }))}><LogOut className="h-4 w-4" /> Sign out others</button>}>
        <ul className="divide-y divide-ink-200/70">
          {sessions.map((s) => (
            <li key={s.ip} className="flex items-center gap-3 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-500"><Smartphone className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink-800">{s.device}</p><p className="text-xs text-ink-500">{s.location} · {s.ip}</p></div>
              {s.current ? <Badge tone="green" dot>This device</Badge> : <Badge tone="gray">Active</Badge>}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---- Notifications ---------------------------------------------------------
const NOTIF_CATS = [
  { key: 'payments', label: 'Payments', desc: 'Receipts submitted, approved or rejected' },
  { key: 'invoices', label: 'Invoices & rent', desc: 'New invoices, due dates and arrears reminders' },
  { key: 'maintenance', label: 'Maintenance', desc: 'New requests, status changes and completions' },
  { key: 'leases', label: 'Leases', desc: 'Renewals, expiries and move-outs' },
  { key: 'system', label: 'System & security', desc: 'Sign-ins, role changes and announcements' },
] as const;
const CHANNELS = [{ key: 'email', label: 'Email' }, { key: 'sms', label: 'SMS' }, { key: 'inApp', label: 'In-app' }] as const;

function NotificationsTab() {
  const dispatch = useAppDispatch();
  const [prefs, setPrefs] = useState<Record<string, Record<string, boolean>>>(() =>
    Object.fromEntries(NOTIF_CATS.map((c) => [c.key, { email: true, sms: c.key === 'payments' || c.key === 'system', inApp: true }])));

  const set = (cat: string, ch: string, v: boolean) => setPrefs((p) => ({ ...p, [cat]: { ...p[cat], [ch]: v } }));

  return (
    <div className="space-y-5">
      <PushNotificationCard />
      <SectionCard title="Notification preferences" subtitle="Choose how you'd like to be notified for each activity"
      action={<button className="btn-primary" onClick={() => dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Notification preferences saved.' }))}>Save preferences</button>}>
      <div className="space-y-1">
        <div className="hidden grid-cols-[1fr_repeat(3,72px)] items-center gap-2 px-1 pb-2 sm:grid">
          <span />
          {CHANNELS.map((ch) => <span key={ch.key} className="text-center text-xs font-semibold uppercase tracking-wide text-ink-400">{ch.label}</span>)}
        </div>
        {NOTIF_CATS.map((cat) => (
          <div key={cat.key} className="grid grid-cols-1 items-center gap-3 rounded-xl border border-ink-200/70 px-4 py-3 sm:grid-cols-[1fr_repeat(3,72px)]">
            <div><p className="text-sm font-semibold text-ink-800">{cat.label}</p><p className="text-xs text-ink-500">{cat.desc}</p></div>
            {CHANNELS.map((ch) => (
              <div key={ch.key} className="flex items-center gap-2 sm:justify-center">
                <span className="text-xs text-ink-500 sm:hidden">{ch.label}</span>
                <Toggle on={prefs[cat.key][ch.key]} onChange={(v) => set(cat.key, ch.key, v)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      </SectionCard>
    </div>
  );
}

function PushNotificationCard() {
  const { supported, denied, subscribed, busy, enable, disable } = usePushNotifications();

  return (
    <SectionCard
      title="Browser push notifications"
      subtitle="Get alerted about payments, invitations and reminders even when this tab is closed"
    >
      {!supported ? (
        <p className="text-sm text-ink-500">
          This browser doesn’t support push notifications, or they haven’t been configured for this deployment.
        </p>
      ) : denied ? (
        <p className="text-sm text-amber-600">
          Notifications are blocked for this site. Re-enable them in your browser’s site settings, then reload.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-200/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink-800">Push to this device</p>
            <p className="text-xs text-ink-500">
              {subscribed ? 'Enabled on this browser.' : 'Turn on to receive push notifications here.'}
            </p>
          </div>
          <Toggle on={subscribed} disabled={busy} onChange={(v) => (v ? enable() : disable())} />
        </div>
      )}
    </SectionCard>
  );
}

// ---- Appearance ------------------------------------------------------------
const THEMES = [
  { key: 'light', label: 'Light', icon: Sun, desc: 'Always light' },
  { key: 'dark', label: 'Dark', icon: Moon, desc: 'Always dark' },
  { key: 'system', label: 'System', icon: Monitor, desc: 'Match your device' },
] as const;

function AppearanceTab() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.ui.theme);
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const pick = (key: ThemePref, label: string) => {
    dispatch(setTheme(key));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${label} theme applied.` }));
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Theme" subtitle="Choose the interface appearance">
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = theme === t.key;
            return (
              <button key={t.key} onClick={() => pick(t.key, t.label)}
                className={classNames('relative flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-5 text-sm font-medium transition-colors',
                  active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:text-ink-700')}>
                <t.icon className="h-6 w-6" />
                {t.label}
                <span className="text-[10px] font-normal text-ink-400">{t.desc}</span>
                {active && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"><Check className="h-3 w-3" /></span>}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Layout" subtitle="Fine-tune the workspace to your liking">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-500"><PanelLeftClose className="h-5 w-5" /></span>
              <div><p className="text-sm font-semibold text-ink-800">Collapse the sidebar</p><p className="text-xs text-ink-500">Show a compact navigation rail.</p></div>
            </div>
            <Toggle on={collapsed} onChange={() => dispatch(toggleSidebarCollapsed())} />
          </div>
          <div className="rounded-xl border border-ink-200 px-4 py-3">
            <p className="mb-2 text-sm font-semibold text-ink-800">Table density</p>
            <div className="flex gap-2">
              {(['comfortable', 'compact'] as const).map((d) => (
                <button key={d} onClick={() => setDensity(d)}
                  className={classNames('rounded-lg border px-3 py-1.5 text-sm capitalize', density === d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600')}>{d}</button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ---- Organization (admin) --------------------------------------------------
const ORG_DEFAULTS = {
  name: 'EstateHub', supportEmail: 'support@estatehub.africa', currency: 'NGN',
  timezone: 'Africa/Lagos', fiscalYearStart: 'January', lateFeePercent: 10,
  gracePeriodDays: 5, invoicePrefix: 'INV', address: '',
};

function OrganizationTab() {
  const dispatch = useAppDispatch();
  const stored = useAppSelector((s) => s.data.settings);
  const [org, setOrg] = useState({ ...ORG_DEFAULTS, ...(stored ?? {}) });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (stored) setOrg({ ...ORG_DEFAULTS, ...stored });
  }, [stored]);

  const upd = <K extends keyof typeof org>(k: K, v: (typeof org)[K]) => setOrg((o) => ({ ...o, [k]: v }));

  const save = async () => {
    setBusy(true);
    await dispatch(
      saveOrganization({
        name: org.name,
        supportEmail: org.supportEmail,
        currency: org.currency,
        timezone: org.timezone,
        fiscalYearStart: org.fiscalYearStart,
        lateFeePercent: Number(org.lateFeePercent),
        gracePeriodDays: Number(org.gracePeriodDays),
        invoicePrefix: org.invoicePrefix,
        address: org.address,
      }),
    );
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Organization" subtitle="Company details used across invoices, receipts and reports"
        action={<button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name"><Input value={org.name} onChange={(e) => upd('name', e.target.value)} /></Field>
          <Field label="Support email"><Input type="email" value={org.supportEmail} onChange={(e) => upd('supportEmail', e.target.value)} /></Field>
          <Field label="Currency">
            <Select value={org.currency} onChange={(e) => upd('currency', e.target.value)}>
              {['NGN', 'GHS', 'KES', 'USD'].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Timezone">
            <Select value={org.timezone} onChange={(e) => upd('timezone', e.target.value)}>
              {['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'UTC'].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </Field>
          <Field label="Address" className="sm:col-span-2"><Input value={org.address} onChange={(e) => upd('address', e.target.value)} placeholder="Registered business address" /></Field>
        </div>
      </SectionCard>

      <SectionCard title="Billing defaults" subtitle="Applied to new invoices unless overridden"
        action={<button className="btn-secondary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Invoice prefix"><Input value={org.invoicePrefix} onChange={(e) => upd('invoicePrefix', e.target.value)} /></Field>
          <Field label="Fiscal year starts">
            <Select value={org.fiscalYearStart} onChange={(e) => upd('fiscalYearStart', e.target.value)}>
              {['January', 'April', 'July', 'October'].map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Late fee (%)" hint="Charged on overdue balances."><Input type="number" value={org.lateFeePercent} onChange={(e) => upd('lateFeePercent', Number(e.target.value))} /></Field>
          <Field label="Grace period (days)"><Input type="number" value={org.gracePeriodDays} onChange={(e) => upd('gracePeriodDays', Number(e.target.value))} /></Field>
        </div>
      </SectionCard>

      <Card className="flex items-center gap-3 border-brand-200 bg-brand-50/50">
        <Building2 className="h-5 w-5 shrink-0 text-brand-600" />
        <p className="text-sm text-ink-600">Saved to the backend (<code>PUT /api/v1/settings/organization</code>) — applied across invoices, receipts and reports for every property.</p>
      </Card>

      <DemoDataCard />
    </div>
  );
}

function DemoDataCard() {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    if (!window.confirm('Reset all demo data on the server to its original seeded state? Any changes made will be lost.')) return;
    setBusy(true);
    await dispatch(resetDemoData());
    setBusy(false);
  };

  return (
    <SectionCard title="Demo data" subtitle="Restore the backend dataset to its original seeded state">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-ink-600">
          Every change is persisted to the Laravel API and shared across the demo accounts. Use this to wipe
          those changes and reload the pristine dataset.
        </p>
        <button className="btn-secondary text-red-600" onClick={run} disabled={busy}>
          <RotateCcw className="h-4 w-4" /> {busy ? 'Resetting…' : 'Reset demo data'}
        </button>
      </div>
    </SectionCard>
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
