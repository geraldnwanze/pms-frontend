import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SeedData } from '@/data/seed';
import { uid, nowIso } from '@/lib/format';
import type {
  Property, Building, Unit, Tenant, Lease, Invoice, Payment, MaintenanceRequest,
  MaintenanceRound, Expense, Vendor, Inspection, Meter, Listing, Lead, DocumentRecord,
  AppNotification, Notice, Message, AuditLog, TaskItem, CalendarEvent,
  InvoiceStatus, PaymentType, PaymentMethod, MaintenanceStatus, AuditAction, User,
} from '@/types';

export type DataState = SeedData;

/** Empty dataset — the real data is loaded from the API via `bootstrap()`. */
export function emptyData(): DataState {
  return {
    users: [], properties: [], buildings: [], units: [], tenants: [], leases: [],
    invoices: [], payments: [], maintenance: [], expenses: [], vendors: [],
    inspections: [], meters: [], listings: [], leads: [], documents: [],
    notifications: [], notices: [], messages: [], audit: [], tasks: [], events: [],
    maintenancePayouts: [], memberships: [], invitations: [],
    settings: null, integrations: {}, rbac: null, dashboard: null, portal: null,
  };
}

const initialState: DataState = emptyData();

// ---- helpers ---------------------------------------------------------------

function recomputeInvoice(inv: Invoice) {
  if (inv.status === 'cancelled') return;
  if (inv.amountPaid >= inv.total) inv.status = 'fully-paid';
  else if (inv.amountPaid > 0) inv.status = 'partially-paid';
  else {
    // no approved money on it
    const overdue = new Date(inv.dueDate) < new Date();
    inv.status = overdue ? 'overdue' : 'unpaid';
  }
}

function logAudit(
  state: DataState,
  action: AuditAction,
  entity: string,
  entityId: string | undefined,
  userId: string,
  summary: string,
) {
  state.audit.unshift({
    id: uid('aud'),
    action,
    entity,
    entityId,
    userId,
    summary,
    timestamp: nowIso(),
    ip: '102.89.34.12',
    device: 'Web / Chrome',
  });
}

function notify(state: DataState, n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) {
  state.notifications.unshift({
    ...n,
    id: uid('ntf'),
    createdAt: nowIso(),
    read: false,
  });
}

// ---- slice -----------------------------------------------------------------

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    // ===== Server hydration ================================================
    /** Replace the whole dataset with a fresh snapshot from the API. */
    hydrateAll(_state, action: PayloadAction<Partial<SeedData>>) {
      return { ...emptyData(), ...action.payload } as DataState;
    },
    /** Drop everything (used on sign-out). */
    resetData() {
      return emptyData();
    },
    /** Swap in a fresh server-computed dashboard rollup without touching the rest. */
    setDashboard(state, action: PayloadAction<SeedData['dashboard']>) {
      state.dashboard = action.payload;
    },
    /** Swap in a fresh server-computed resident-portal rollup. */
    setPortal(state, action: PayloadAction<SeedData['portal']>) {
      state.portal = action.payload;
    },

    // ===== Payments: submission & verification workflow =====================
    submitPayment: {
      reducer(state, action: PayloadAction<Payment>) {
        const payment = action.payload;
        state.payments.unshift(payment);
        logAudit(state, 'payment-submit', 'Payment', payment.id, payment.tenantId, `Submitted ${payment.code} (₦${payment.amount.toLocaleString('en-NG')}) for verification`);
        notify(state, {
          kind: 'payment',
          title: 'New payment awaiting verification',
          body: `${payment.code} — ₦${payment.amount.toLocaleString('en-NG')} submitted by tenant.`,
          forRole: 'finance',
          link: '/payments/verification',
        });
        // Mark invoice as pending-verification if it had no approved money yet
        const inv = state.invoices.find((i) => i.id === payment.invoiceId);
        if (inv && inv.amountPaid === 0 && inv.status !== 'cancelled') {
          inv.status = 'pending-verification';
        }
      },
      prepare(input: {
        invoiceId: string; leaseId: string; unitId: string; propertyId: string; tenantId: string;
        type: PaymentType; method: PaymentMethod; amount: number; paymentDate: string;
        bankName?: string; reference: string; payerName?: string; description?: string;
        receiptFileName?: string; receiptDataUrl?: string; supportingFileName?: string;
      }) {
        const id = uid('pay');
        // `receiptDataUrl` is write-through only (the API stores the file); keep it
        // off the persisted record so it doesn't sit in the store.
        const { receiptDataUrl, ...rest } = input;
        const payment: Payment & { receiptDataUrl?: string } = {
          ...rest,
          id,
          code: `PAY-${id.slice(-5).toUpperCase()}`,
          status: 'pending-verification',
          submittedAt: nowIso(),
        };
        if (receiptDataUrl) payment.receiptDataUrl = receiptDataUrl;
        return { payload: payment };
      },
    },

    approvePayment(state, action: PayloadAction<{ paymentId: string; actorId: string; notes?: string }>) {
      const { paymentId, actorId, notes } = action.payload;
      const p = state.payments.find((x) => x.id === paymentId);
      if (!p || p.status !== 'pending-verification') return;
      p.status = 'approved';
      p.reviewedById = actorId;
      p.reviewedAt = nowIso();
      p.verificationNotes = notes;
      const inv = state.invoices.find((i) => i.id === p.invoiceId);
      if (inv) {
        inv.amountPaid = Math.min(inv.total, inv.amountPaid + p.amount);
        recomputeInvoice(inv);
        p.balanceAfter = Math.max(0, inv.total - inv.amountPaid);
      }
      logAudit(state, 'payment-approve', 'Payment', p.id, actorId, `Approved ${p.code} (₦${p.amount.toLocaleString('en-NG')})`);
      notify(state, {
        kind: 'payment', title: 'Payment approved',
        body: `Your payment ${p.code} of ₦${p.amount.toLocaleString('en-NG')} was approved.`,
        forUserId: p.tenantId, link: '/portal/payments',
      });
    },

    rejectPayment(state, action: PayloadAction<{ paymentId: string; actorId: string; reason: string }>) {
      const { paymentId, actorId, reason } = action.payload;
      const p = state.payments.find((x) => x.id === paymentId);
      if (!p || p.status !== 'pending-verification') return;
      p.status = 'rejected';
      p.reviewedById = actorId;
      p.reviewedAt = nowIso();
      p.rejectionReason = reason;
      const inv = state.invoices.find((i) => i.id === p.invoiceId);
      if (inv && inv.amountPaid === 0 && inv.status === 'pending-verification') {
        recomputeInvoice(inv);
      }
      logAudit(state, 'payment-reject', 'Payment', p.id, actorId, `Rejected ${p.code}: ${reason}`);
      notify(state, {
        kind: 'payment', title: 'Payment rejected',
        body: `Your payment ${p.code} was rejected: ${reason}`,
        forUserId: p.tenantId, link: '/portal/payments',
      });
    },

    requestPaymentInfo(state, action: PayloadAction<{ paymentId: string; actorId: string; note: string }>) {
      const { paymentId, actorId, note } = action.payload;
      const p = state.payments.find((x) => x.id === paymentId);
      if (!p) return;
      p.verificationNotes = note;
      logAudit(state, 'edit', 'Payment', p.id, actorId, `Requested more info on ${p.code}: ${note}`);
      notify(state, {
        kind: 'payment', title: 'More information requested',
        body: `Regarding ${p.code}: ${note}`,
        forUserId: p.tenantId, link: '/portal/payments',
      });
    },

    refundPayment(state, action: PayloadAction<{ paymentId: string; actorId: string; reason: string }>) {
      const { paymentId, actorId, reason } = action.payload;
      const p = state.payments.find((x) => x.id === paymentId);
      if (!p || p.status !== 'approved') return;
      p.status = 'refunded';
      const inv = state.invoices.find((i) => i.id === p.invoiceId);
      if (inv) {
        inv.amountPaid = Math.max(0, inv.amountPaid - p.amount);
        recomputeInvoice(inv);
      }
      logAudit(state, 'refund', 'Payment', p.id, actorId, `Refunded ${p.code} (₦${p.amount.toLocaleString('en-NG')}): ${reason}`);
    },

    // ===== Invoices =========================================================
    createInvoice: {
      reducer(state, action: PayloadAction<Invoice>) {
        state.invoices.unshift(action.payload);
        logAudit(state, 'create', 'Invoice', action.payload.id, 'system', `Created invoice ${action.payload.code}`);
      },
      prepare(input: Omit<Invoice, 'id' | 'code' | 'amountPaid' | 'status'> & { status?: InvoiceStatus }) {
        const id = uid('inv');
        return {
          payload: {
            ...input,
            id,
            code: `INV-${id.slice(-5).toUpperCase()}`,
            amountPaid: 0,
            status: input.status ?? 'unpaid',
          } as Invoice,
        };
      },
    },
    cancelInvoice(state, action: PayloadAction<{ invoiceId: string; actorId: string }>) {
      const inv = state.invoices.find((i) => i.id === action.payload.invoiceId);
      if (inv) {
        inv.status = 'cancelled';
        logAudit(state, 'edit', 'Invoice', inv.id, action.payload.actorId, `Cancelled invoice ${inv.code}`);
      }
    },

    // ===== Properties / buildings / units ===================================
    createProperty: {
      reducer(state, action: PayloadAction<Property>) {
        state.properties.unshift(action.payload);
        logAudit(state, 'create', 'Property', action.payload.id, action.payload.managerId ?? 'admin', `Registered property ${action.payload.name}`);
      },
      prepare(input: Omit<Property, 'id' | 'code' | 'createdAt'>) {
        const id = uid('prop');
        return { payload: { ...input, id, code: `PROP-${id.slice(-4).toUpperCase()}`, createdAt: nowIso() } as Property };
      },
    },
    updateProperty(state, action: PayloadAction<Partial<Property> & { id: string }>) {
      const idx = state.properties.findIndex((p) => p.id === action.payload.id);
      if (idx >= 0) state.properties[idx] = { ...state.properties[idx], ...action.payload };
    },
    createBuilding: {
      reducer(state, action: PayloadAction<Building>) {
        state.buildings.push(action.payload);
      },
      prepare(input: Omit<Building, 'id' | 'code'> & { code?: string }) {
        const id = uid('bld');
        return { payload: { ...input, id, code: input.code ?? `B-${id.slice(-4).toUpperCase()}` } as Building };
      },
    },
    updateBuilding(state, action: PayloadAction<Partial<Building> & { id: string }>) {
      const idx = state.buildings.findIndex((b) => b.id === action.payload.id);
      if (idx >= 0) state.buildings[idx] = { ...state.buildings[idx], ...action.payload };
    },
    createUnit: {
      reducer(state, action: PayloadAction<Unit>) {
        state.units.push(action.payload);
      },
      prepare(input: Omit<Unit, 'id' | 'meterIds'> & { meterIds?: string[] }) {
        const id = uid('unit');
        return { payload: { ...input, id, meterIds: input.meterIds ?? [] } as Unit };
      },
    },
    updateUnit(state, action: PayloadAction<Partial<Unit> & { id: string }>) {
      const idx = state.units.findIndex((u) => u.id === action.payload.id);
      if (idx >= 0) state.units[idx] = { ...state.units[idx], ...action.payload };
    },

    // ===== Tenants ==========================================================
    createTenant: {
      reducer(state, action: PayloadAction<Tenant>) {
        state.tenants.push(action.payload);
        logAudit(state, 'create', 'Tenant', action.payload.id, 'admin', `Added tenant ${action.payload.name}`);
      },
      prepare(input: Omit<Tenant, 'id' | 'createdAt'>) {
        const id = uid('ten');
        return { payload: { ...input, id, createdAt: nowIso() } as Tenant };
      },
    },
    updateTenant(state, action: PayloadAction<Partial<Tenant> & { id: string }>) {
      const idx = state.tenants.findIndex((t) => t.id === action.payload.id);
      if (idx >= 0) state.tenants[idx] = { ...state.tenants[idx], ...action.payload };
    },

    // ===== Leases ===========================================================
    createLease: {
      reducer(state, action: PayloadAction<Lease>) {
        state.leases.unshift(action.payload);
        logAudit(state, 'create', 'Lease', action.payload.id, 'manager', `Created lease ${action.payload.code}`);
      },
      prepare(input: Omit<Lease, 'id' | 'code' | 'createdAt'>) {
        const id = uid('lease');
        return { payload: { ...input, id, code: `LSE-${id.slice(-5).toUpperCase()}`, createdAt: nowIso() } as Lease };
      },
    },
    renewLease(state, action: PayloadAction<{ leaseId: string; actorId: string; newEndDate: string }>) {
      const l = state.leases.find((x) => x.id === action.payload.leaseId);
      if (l) {
        l.status = 'renewed';
        l.endDate = action.payload.newEndDate;
        logAudit(state, 'edit', 'Lease', l.id, action.payload.actorId, `Renewed lease ${l.code} to ${action.payload.newEndDate}`);
      }
    },
    terminateLease(state, action: PayloadAction<{ leaseId: string; actorId: string }>) {
      const l = state.leases.find((x) => x.id === action.payload.leaseId);
      if (l) {
        l.status = 'terminated';
        const unit = state.units.find((u) => u.id === l.unitId);
        if (unit) unit.status = 'available';
        logAudit(state, 'edit', 'Lease', l.id, action.payload.actorId, `Terminated lease ${l.code}`);
      }
    },

    // ===== Maintenance ======================================================
    createMaintenance: {
      reducer(state, action: PayloadAction<MaintenanceRequest>) {
        state.maintenance.unshift(action.payload);
        logAudit(state, 'create', 'Maintenance', action.payload.id, action.payload.tenantId ?? 'tenant', `Logged maintenance ${action.payload.code}: ${action.payload.title}`);
        notify(state, {
          kind: 'maintenance', title: 'New maintenance request',
          body: `${action.payload.code}: ${action.payload.title} (${action.payload.urgency})`,
          forRole: 'manager', link: '/maintenance',
        });
      },
      prepare(input: Omit<MaintenanceRequest, 'id' | 'code' | 'createdAt' | 'status' | 'materialsCost' | 'labourCost' | 'afterPhotos' | 'rounds'> & Partial<Pick<MaintenanceRequest, 'status' | 'materialsCost' | 'labourCost' | 'photos' | 'rounds'>>) {
        const id = uid('mnt');
        return {
          payload: {
            afterPhotos: [], materialsCost: 0, labourCost: 0,
            ...input, id, code: `MNT-${id.slice(-5).toUpperCase()}`, createdAt: nowIso(),
            photos: input.photos ?? [],
            rounds: input.rounds ?? [],
            status: input.status ?? 'open',
          } as MaintenanceRequest,
        };
      },
    },
    updateMaintenance(state, action: PayloadAction<{ id: string; actorId: string; changes: Partial<MaintenanceRequest> }>) {
      const m = state.maintenance.find((x) => x.id === action.payload.id);
      if (!m) return;
      const prevStatus = m.status;
      Object.assign(m, action.payload.changes);
      const newStatus = action.payload.changes.status as MaintenanceStatus | undefined;
      if (newStatus && newStatus !== prevStatus) {
        if (newStatus === 'completed') m.completedAt = nowIso();
        if (newStatus === 'verified') m.verifiedById = action.payload.actorId;
        if (newStatus === 'closed') m.closedAt = nowIso();
        logAudit(state, 'edit', 'Maintenance', m.id, action.payload.actorId, `${m.code} status → ${newStatus}`);
      }
    },
    addMaintenanceRound(state, action: PayloadAction<{ id: string; actorId: string; round: Omit<MaintenanceRound, 'id'> }>) {
      const m = state.maintenance.find((x) => x.id === action.payload.id);
      if (!m) return;
      if (!m.rounds) m.rounds = [];
      const round: MaintenanceRound = { ...action.payload.round, id: uid('rnd') };
      m.rounds.push(round);
      const stageLabel = { triage: 'Triage', progress: 'In-progress', final: 'Post-repair' }[round.stage];
      logAudit(state, 'edit', 'Maintenance', m.id, action.payload.actorId, `${m.code} — ${stageLabel} round recorded (${round.outcome})`);
      notify(state, {
        kind: 'maintenance', title: `${stageLabel} round recorded`,
        body: `${m.code}: ${m.title} — ${round.outcome === 'ok' ? 'no issues found' : 'issues flagged'}.`,
        forRole: 'manager', link: `/maintenance/${m.id}`,
      });
    },

    // ===== Expenses & vendors ===============================================
    createExpense: {
      reducer(state, action: PayloadAction<Expense>) {
        state.expenses.unshift(action.payload);
        logAudit(state, 'create', 'Expense', action.payload.id, 'finance', `Recorded expense ${action.payload.code} (₦${action.payload.amount.toLocaleString('en-NG')})`);
      },
      prepare(input: Omit<Expense, 'id' | 'code' | 'status'> & { status?: Expense['status'] }) {
        const id = uid('exp');
        return { payload: { ...input, id, code: `EXP-${id.slice(-5).toUpperCase()}`, status: input.status ?? 'pending' } as Expense };
      },
    },
    setExpenseStatus(state, action: PayloadAction<{ id: string; status: Expense['status']; actorId: string }>) {
      const e = state.expenses.find((x) => x.id === action.payload.id);
      if (e) {
        e.status = action.payload.status;
        if (action.payload.status !== 'pending') e.approvedById = action.payload.actorId;
        logAudit(state, action.payload.status === 'approved' ? 'approve' : 'edit', 'Expense', e.id, action.payload.actorId, `${e.code} → ${action.payload.status}`);
      }
    },
    createVendor: {
      reducer(state, action: PayloadAction<Vendor>) {
        state.vendors.push(action.payload);
      },
      prepare(input: Omit<Vendor, 'id' | 'totalPaid' | 'outstanding'>) {
        return { payload: { ...input, id: uid('vnd'), totalPaid: 0, outstanding: 0 } as Vendor };
      },
    },

    // ===== Inspections ======================================================
    createInspection: {
      reducer(state, action: PayloadAction<Inspection>) {
        state.inspections.unshift(action.payload);
        notify(state, { kind: 'inspection', title: 'Inspection scheduled', body: `${action.payload.type} inspection scheduled for ${action.payload.scheduledDate}.`, forRole: 'manager', link: '/inspections' });
      },
      prepare(input: Omit<Inspection, 'id' | 'code'>) {
        const id = uid('insp');
        return { payload: { ...input, id, code: `INS-${id.slice(-5).toUpperCase()}` } as Inspection };
      },
    },
    updateInspection(state, action: PayloadAction<Partial<Inspection> & { id: string }>) {
      const idx = state.inspections.findIndex((i) => i.id === action.payload.id);
      if (idx >= 0) state.inspections[idx] = { ...state.inspections[idx], ...action.payload };
    },

    // ===== Leads / listings =================================================
    createLead: {
      reducer(state, action: PayloadAction<Lead>) {
        state.leads.unshift(action.payload);
      },
      prepare(input: Omit<Lead, 'id' | 'createdAt' | 'status'> & { status?: Lead['status'] }) {
        return { payload: { ...input, id: uid('lead'), createdAt: nowIso(), status: input.status ?? 'new' } as Lead };
      },
    },
    updateLead(state, action: PayloadAction<Partial<Lead> & { id: string }>) {
      const idx = state.leads.findIndex((l) => l.id === action.payload.id);
      if (idx >= 0) state.leads[idx] = { ...state.leads[idx], ...action.payload };
    },
    updateListing(state, action: PayloadAction<Partial<Listing> & { id: string }>) {
      const idx = state.listings.findIndex((l) => l.id === action.payload.id);
      if (idx >= 0) state.listings[idx] = { ...state.listings[idx], ...action.payload };
    },

    // ===== Meters ===========================================================
    addMeterReading(state, action: PayloadAction<{ meterId: string; value: number; date: string }>) {
      const m = state.meters.find((x) => x.id === action.payload.meterId);
      if (m) {
        m.previousReading = m.currentReading;
        m.currentReading = action.payload.value;
        m.history.push({ date: action.payload.date, value: action.payload.value });
      }
    },

    // ===== Documents ========================================================
    addDocument: {
      reducer(state, action: PayloadAction<DocumentRecord>) {
        state.documents.unshift(action.payload);
        logAudit(state, 'create', 'Document', action.payload.id, action.payload.uploadedById, `Uploaded document ${action.payload.name}`);
      },
      prepare(input: Omit<DocumentRecord, 'id' | 'uploadedAt'>) {
        return { payload: { ...input, id: uid('doc'), uploadedAt: nowIso() } as DocumentRecord };
      },
    },
    deleteDocument(state, action: PayloadAction<{ id: string; actorId: string }>) {
      state.documents = state.documents.filter((d) => d.id !== action.payload.id);
      logAudit(state, 'delete', 'Document', action.payload.id, action.payload.actorId, `Deleted document ${action.payload.id}`);
    },

    // ===== Notices & messages ===============================================
    createNotice: {
      reducer(state, action: PayloadAction<Notice>) {
        state.notices.unshift(action.payload);
        notify(state, { kind: 'announcement', title: action.payload.title, body: action.payload.body, link: '/notices' });
      },
      prepare(input: Omit<Notice, 'id' | 'createdAt'>) {
        return { payload: { ...input, id: uid('notice'), createdAt: nowIso() } as Notice };
      },
    },
    sendMessage: {
      reducer(state, action: PayloadAction<Message>) {
        state.messages.push(action.payload);
      },
      prepare(input: Omit<Message, 'id' | 'createdAt' | 'read'>) {
        return { payload: { ...input, id: uid('msg'), createdAt: nowIso(), read: false } as Message };
      },
    },
    markThreadRead(state, action: PayloadAction<{ threadId: string; userId: string }>) {
      state.messages.forEach((m) => {
        if (m.threadId === action.payload.threadId && m.toUserId === action.payload.userId) m.read = true;
      });
    },

    // ===== Notifications ====================================================
    /** Replace the notification list from a poll of GET /notifications. */
    setNotifications(state, action: PayloadAction<AppNotification[]>) {
      state.notifications = action.payload;
    },
    /** Prepend one pushed over Reverb, unless we already have it. */
    receiveNotification(state, action: PayloadAction<AppNotification>) {
      if (state.notifications.some((n) => n.id === action.payload.id)) return;
      state.notifications.unshift(action.payload);
    },
    markNotificationRead(state, action: PayloadAction<string>) {
      const n = state.notifications.find((x) => x.id === action.payload);
      if (n) n.read = true;
    },
    markAllNotificationsRead(state, action: PayloadAction<{ userId: string; role: string }>) {
      state.notifications.forEach((n) => {
        if (!n.forRole && !n.forUserId) n.read = true;
        if (n.forUserId === action.payload.userId) n.read = true;
        if (n.forRole === action.payload.role) n.read = true;
      });
    },

    // ===== Tasks ============================================================
    toggleTask(state, action: PayloadAction<string>) {
      const t = state.tasks.find((x) => x.id === action.payload);
      if (t) t.done = !t.done;
    },
    createTask: {
      reducer(state, action: PayloadAction<TaskItem>) {
        state.tasks.unshift(action.payload);
      },
      prepare(input: Omit<TaskItem, 'id' | 'done'> & { done?: boolean }) {
        return { payload: { ...input, id: uid('task'), done: input.done ?? false } as TaskItem };
      },
    },

    // ===== Users & roles ====================================================
    updateUser(state, action: PayloadAction<{ id: string; changes: Partial<User>; actorId: string }>) {
      const u = state.users.find((x) => x.id === action.payload.id);
      if (!u) return;
      const { changes, actorId } = action.payload;
      Object.assign(u, changes);
      const what = changes.role !== undefined
        ? `role → ${changes.role}`
        : changes.status !== undefined
          ? `status → ${changes.status}`
          : changes.twoFactorEnabled !== undefined
            ? `2FA ${changes.twoFactorEnabled ? 'enabled' : 'disabled'}`
            : 'profile updated';
      logAudit(state, changes.role !== undefined ? 'permission-change' : 'edit', 'User', u.id, actorId, `${u.name}: ${what}`);
    },

    // ===== Audit (explicit, e.g. exports/logins) ============================
    recordAudit(state, action: PayloadAction<{ action: AuditAction; entity: string; entityId?: string; userId: string; summary: string }>) {
      logAudit(state, action.payload.action, action.payload.entity, action.payload.entityId, action.payload.userId, action.payload.summary);
    },
  },
});

export const dataActions = dataSlice.actions;
export default dataSlice.reducer;

// re-export types that consumers commonly need alongside actions
export type {
  Property, Building, Unit, Tenant, Lease, Invoice, Payment, MaintenanceRequest,
  Expense, Vendor, Inspection, Meter, Listing, Lead, DocumentRecord,
  AppNotification, Notice, Message, AuditLog, TaskItem, CalendarEvent,
};
