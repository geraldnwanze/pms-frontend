import type { Middleware } from '@reduxjs/toolkit';
import { api, ApiError } from '@/lib/api';
import { announceSessionEnded, bootstrap, signOut } from './thunks';
import { dismissToast, pushToast } from './uiSlice';
import { uid } from '@/lib/format';

/**
 * Write-through bridge between the Redux store and the v1 REST API.
 *
 * Reducers still run first and update local state optimistically (instant UX).
 * This middleware then translates the same `data/*` action into the matching
 * v1 request. After a successful write it schedules a debounced re-`bootstrap()`
 * so the store converges on server truth (generated ids, recomputed invoice
 * status, cascades, audit rows, notifications). A failed write rolls back by
 * re-bootstrapping immediately; a 401 signs the user out.
 */

type Req = { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown };
type Payload = any; // action payloads are the slice's own prepared shapes

const withoutId = (p: Payload) => {
  const { id, ...rest } = p ?? {};
  return rest;
};

const ROUTES: Record<string, (p: Payload) => Req | null> = {
  // ---- creates (payload = full record incl. client-generated id) ----------
  createProperty: (p) => ({ method: 'POST', path: '/properties', body: p }),
  createBuilding: (p) => ({ method: 'POST', path: '/buildings', body: p }),
  createUnit: (p) => ({ method: 'POST', path: '/units', body: p }),
  createTenant: (p) => ({ method: 'POST', path: '/tenants', body: p }),
  createLease: (p) => ({ method: 'POST', path: '/leases', body: p }),
  createInvoice: (p) => ({ method: 'POST', path: '/invoices', body: p }),
  createExpense: (p) => ({ method: 'POST', path: '/expenses', body: p }),
  createVendor: (p) => ({ method: 'POST', path: '/vendors', body: p }),
  createInspection: (p) => ({ method: 'POST', path: '/inspections', body: p }),
  createLead: (p) => ({ method: 'POST', path: '/leads', body: p }),
  createNotice: (p) => ({ method: 'POST', path: '/notices', body: p }),
  createTask: (p) => ({ method: 'POST', path: '/tasks', body: p }),
  createMaintenance: (p) => ({ method: 'POST', path: '/maintenance', body: p }),
  addDocument: (p) => ({ method: 'POST', path: '/documents', body: p }),
  submitPayment: (p) => ({ method: 'POST', path: '/payments/submit', body: p }),
  sendMessage: (p) => ({ method: 'POST', path: '/messages', body: p }),

  // ---- updates (payload = partial & { id }) ------------------------------
  updateProperty: (p) => ({ method: 'PATCH', path: `/properties/${p.id}`, body: withoutId(p) }),
  updateBuilding: (p) => ({ method: 'PATCH', path: `/buildings/${p.id}`, body: withoutId(p) }),
  updateUnit: (p) => ({ method: 'PATCH', path: `/units/${p.id}`, body: withoutId(p) }),
  updateTenant: (p) => ({ method: 'PATCH', path: `/tenants/${p.id}`, body: withoutId(p) }),
  updateInspection: (p) => ({ method: 'PATCH', path: `/inspections/${p.id}`, body: withoutId(p) }),
  updateLead: (p) => ({ method: 'PATCH', path: `/leads/${p.id}`, body: withoutId(p) }),
  updateListing: (p) => ({ method: 'PATCH', path: `/listings/${p.id}`, body: withoutId(p) }),
  updateUser: (p) => ({ method: 'PATCH', path: `/users/${p.id}`, body: p.changes }),
  updateMaintenance: (p) =>
    p.changes?.status
      ? { method: 'POST', path: `/maintenance/${p.id}/transition`, body: p.changes }
      : { method: 'PATCH', path: `/maintenance/${p.id}`, body: p.changes },

  // ---- workflow actions ------------------------------------------------
  approvePayment: (p) => ({ method: 'POST', path: `/payments/${p.paymentId}/approve`, body: { notes: p.notes } }),
  rejectPayment: (p) => ({ method: 'POST', path: `/payments/${p.paymentId}/reject`, body: { reason: p.reason } }),
  requestPaymentInfo: (p) => ({ method: 'POST', path: `/payments/${p.paymentId}/request-info`, body: { note: p.note } }),
  refundPayment: (p) => ({ method: 'POST', path: `/payments/${p.paymentId}/refund`, body: { reason: p.reason } }),
  cancelInvoice: (p) => ({ method: 'POST', path: `/invoices/${p.invoiceId}/cancel` }),
  waiveLateFee: (p) => ({ method: 'POST', path: `/invoices/${p.invoiceId}/waive-late-fee`, body: { reason: p.reason } }),
  billMeter: (p) => ({ method: 'POST', path: `/meters/${p.meterId}/bill` }),
  receiveDeposit: (p) => ({ method: 'POST', path: `/leases/${p.leaseId}/deposit/receive`, body: { amount: p.amount, method: p.method, reference: p.reference, date: p.date } }),
  settleDeposit: (p) => ({ method: 'POST', path: `/leases/${p.leaseId}/deposit/settle`, body: { deductions: p.deductions, applyToArrears: p.applyToArrears } }),
  renewLease: (p) => ({ method: 'POST', path: `/leases/${p.leaseId}/renew`, body: { endDate: p.newEndDate } }),
  terminateLease: (p) => ({ method: 'POST', path: `/leases/${p.leaseId}/terminate` }),
  setExpenseStatus: (p) => ({ method: 'POST', path: `/expenses/${p.id}/status`, body: { status: p.status } }),
  addMeterReading: (p) => ({ method: 'POST', path: `/meters/${p.meterId}/readings`, body: { value: p.value, date: p.date } }),
  addMaintenanceRound: (p) => ({ method: 'POST', path: `/maintenance/${p.id}/rounds`, body: p.round }),
  toggleTask: (p) => ({ method: 'POST', path: `/tasks/${p}/toggle` }),
  markThreadRead: (p) => ({ method: 'POST', path: '/messages/mark-thread-read', body: { threadId: p.threadId } }),
  markNotificationRead: (p) => ({ method: 'POST', path: `/notifications/${p}/read` }),
  markAllNotificationsRead: () => ({ method: 'POST', path: '/notifications/read-all' }),
  deleteDocument: (p) => ({ method: 'DELETE', path: `/documents/${p.id}` }),

  // ---- local-only (no server endpoint) --------------------------------
  recordAudit: () => null,
  hydrateAll: () => null,
  resetData: () => null,
};

const REFRESH_DEBOUNCE_MS = 700;

export const apiMiddleware: Middleware = (store) => {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Writes to one meter go to the server one after another: logging a reading and then billing it must arrive in that order.
  const meterQueues = new Map<string, Promise<unknown>>();
  const send = (req: Req) => {
    const meter = /^\/meters\/([^/]+)/.exec(req.path)?.[1];
    if (!meter) return api.request(req.method, req.path, req.body);
    const run = (meterQueues.get(meter) ?? Promise.resolve()).then(() => api.request(req.method, req.path, req.body));
    const tail = run.catch(() => undefined);
    meterQueues.set(meter, tail);
    void tail.then(() => { if (meterQueues.get(meter) === tail) meterQueues.delete(meter); });
    return run;
  };

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      (store.dispatch as any)(bootstrap());
    }, REFRESH_DEBOUNCE_MS);
  };

  const toast = (kind: 'error' | 'info', message: string) =>
    store.dispatch(pushToast({ id: uid('t'), kind, message }));

  return (next) => (action) => {
    const result = next(action); // reducer runs first (optimistic)

    const type = (action as { type?: string }).type;
    if (!type || !type.startsWith('data/')) return result;

    const name = type.slice('data/'.length);
    const build = ROUTES[name];
    if (!build) return result; // unmapped → treat as local-only

    const req = build((action as { payload?: unknown }).payload);
    if (!req) return result;

    // The views raise their "…saved" toast the moment they dispatch, before the server has answered. Remember
    // which success toasts appeared with this action so a rejected write can take them back instead of
    // showing "saved" and "couldn't save" side by side.
    const before = new Set(store.getState().ui?.toasts?.map((t: { id: string }) => t.id) ?? []);
    const optimisticToasts = new Set<string>();
    setTimeout(() => {
      for (const t of store.getState().ui?.toasts ?? []) {
        if (t.kind === 'success' && !before.has(t.id)) optimisticToasts.add(t.id);
      }
    }, 0);

    send(req)
      .then(() => scheduleRefresh())
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          (store.dispatch as any)(signOut());
          announceSessionEnded(store.dispatch as never, store.getState as never, err);
          return;
        }
        const detail =
          err instanceof ApiError
            ? err.errors
              ? Object.values(err.errors).flat()[0] ?? err.message
              : err.message
            : 'The change could not be saved.';
        optimisticToasts.forEach((id) => store.dispatch(dismissToast(id)));
        toast('error', `Couldn’t save: ${detail}`);
        (store.dispatch as any)(bootstrap()); // roll back to server state
      });

    return result;
  };
};
