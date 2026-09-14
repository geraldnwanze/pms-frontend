'use client';

import { useMemo, useState } from 'react';
import { MailPlus, Check, X, Building2, ShieldCheck, Landmark } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectInvitations, selectMemberships, selectCurrentUser } from '@/store/selectors';
import { acceptInvitation, declineInvitation, saveMembershipBank } from '@/store/thunks';
import { PageHeader, Card, Badge, EmptyState } from '@/components/ui';
import { Field, Input } from '@/components/ui/form';
import { ROLE_LABELS } from '@/config/roles';
import { fromNow } from '@/lib/format';
import type { MemberRole, PropertyMember } from '@/types';

export function Invitations() {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectCurrentUser);
  const invitations = useAppSelector(selectInvitations);
  const memberships = useAppSelector(selectMemberships);
  const [busy, setBusy] = useState<string | null>(null);

  const active = useMemo(
    () => memberships.filter((m) => m.status === 'active'),
    [memberships],
  );

  const run = async (fn: () => Promise<unknown>, id: string) => {
    setBusy(id);
    await fn();
    setBusy(null);
  };

  return (
    <div>
      <PageHeader
        title="Invitations"
        subtitle="Accept an invitation to start seeing a property's data"
      />

      {invitations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MailPlus className="h-6 w-6" />}
            title="No pending invitations"
            description="When an owner or manager invites you to a property, it will show up here to accept."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <Card key={inv.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink-800">{inv.propertyName ?? inv.propertyId}</span>
                  <Badge tone="indigo">{ROLE_LABELS[inv.role as MemberRole]}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-ink-500">
                  Invited by {inv.invitedByName ?? 'an owner'}
                  {inv.invitedAt ? ` · ${fromNow(inv.invitedAt)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary text-red-600"
                  disabled={busy !== null}
                  onClick={() => run(() => dispatch(declineInvitation(inv.id)), inv.id)}
                >
                  <X className="h-4 w-4" /> Decline
                </button>
                <button
                  className="btn-primary"
                  disabled={busy !== null}
                  onClick={() => run(() => dispatch(acceptInvitation(inv.id)), inv.id)}
                >
                  <Check className="h-4 w-4" /> {busy === inv.id ? 'Joining…' : 'Accept'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-400">
        Your memberships
      </h2>
      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Not on any property yet"
            description={
              me?.role === 'user'
                ? 'Create a property to manage it as its owner, or accept an invitation above.'
                : 'You currently have no active property memberships.'
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {active.map((m) => (
            <MembershipCard key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MembershipCard({ member }: { member: PropertyMember }) {
  const dispatch = useAppDispatch();
  const isTenant = member.role === 'tenant';
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bankName: member.bankName ?? '',
    bankAccountName: member.bankAccountName ?? '',
    bankAccountNumber: member.bankAccountNumber ?? '',
    bankCode: member.bankCode ?? '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const ok = await dispatch(
      saveMembershipBank(member.id, {
        bankName: form.bankName.trim() || null,
        bankAccountName: form.bankAccountName.trim() || null,
        bankAccountNumber: form.bankAccountNumber.trim() || null,
        bankCode: form.bankCode.trim() || null,
      }),
    );
    setSaving(false);
    if (ok) setOpen(false);
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-800">{member.propertyName ?? member.propertyId}</p>
          <p className="text-xs text-ink-500">{ROLE_LABELS[member.role as MemberRole]}</p>
        </div>
        {!isTenant && (
          <Badge tone={member.hasBankDetails ? 'green' : 'amber'}>
            {member.hasBankDetails ? 'Payout set' : 'No payout account'}
          </Badge>
        )}
      </div>

      {!isTenant && (
        <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
          {!open ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-xs text-ink-500">
                <span className="flex items-center gap-1.5 font-semibold text-ink-600">
                  <Landmark className="h-3.5 w-3.5" /> Payout account
                </span>
                {member.hasBankDetails ? (
                  <p className="mt-0.5 truncate">
                    {member.bankName} ·{' '}
                    {member.bankAccountNumber
                      ? `••••${member.bankAccountNumber.slice(-4)}`
                      : '—'}
                  </p>
                ) : (
                  <p className="mt-0.5">
                    Add the account you want maintenance payouts on this property paid into.
                  </p>
                )}
              </div>
              <button className="btn-secondary shrink-0 text-xs" onClick={() => setOpen(true)}>
                {member.hasBankDetails ? 'Edit' : 'Add'}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Bank name">
                  <Input value={form.bankName} onChange={set('bankName')} placeholder="e.g. GTBank" />
                </Field>
                <Field label="Account name">
                  <Input
                    value={form.bankAccountName}
                    onChange={set('bankAccountName')}
                    placeholder="Name on the account"
                  />
                </Field>
                <Field label="Account number">
                  <Input
                    value={form.bankAccountNumber}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        bankAccountNumber: e.target.value.replace(/\D/g, '').slice(0, 20),
                      }))
                    }
                    inputMode="numeric"
                    placeholder="10-digit NUBAN"
                  />
                </Field>
                <Field label="Bank code" hint="Optional — used for automatic transfers later.">
                  <Input value={form.bankCode} onChange={set('bankCode')} placeholder="e.g. 058" />
                </Field>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="btn-ghost text-xs"
                  disabled={saving}
                  onClick={() => {
                    setForm({
                      bankName: member.bankName ?? '',
                      bankAccountName: member.bankAccountName ?? '',
                      bankAccountNumber: member.bankAccountNumber ?? '',
                      bankCode: member.bankCode ?? '',
                    });
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button className="btn-primary text-xs" disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save payout details'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
