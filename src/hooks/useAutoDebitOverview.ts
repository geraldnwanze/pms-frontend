'use client';

import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectModuleOn } from '@/store/selectors';
import { api } from '@/lib/api';
import type { AutoDebitOverview } from '@/types';

export const AUTO_DEBIT_STAFF_ROLES = ['superadmin', 'admin', 'owner', 'manager', 'finance'];

/**
 * Auto-debit state per invoice for the properties the signed-in staff member can see.
 * Returns null until loaded, and stays null for roles that can't see it (or if the call fails) —
 * callers simply don't render the auto-debit UI in that case.
 */
export function useAutoDebitOverview(): AutoDebitOverview | null {
  const user = useAppSelector(selectCurrentUser);
  const moduleOn = useAppSelector(selectModuleOn('auto-debit'));
  const eligible = moduleOn && !!user && AUTO_DEBIT_STAFF_ROLES.includes(user.role);
  const [overview, setOverview] = useState<AutoDebitOverview | null>(null);

  useEffect(() => {
    if (!eligible) return;
    let live = true;
    api.autoDebitOverview().then((o) => live && setOverview(o)).catch(() => live && setOverview(null));
    return () => { live = false; };
  }, [eligible, user?.id]);

  return eligible ? overview : null;
}
