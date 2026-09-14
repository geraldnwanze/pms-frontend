// ============================================================================
// Client for the Laravel v1 REST API.
//
// Auth: Sanctum bearer token, stored in localStorage under `pms.token`.
// Every response is the envelope { data, message, meta }; helpers here return
// `data` (and `meta` where useful).
// ============================================================================

import type {
  OrganizationSettings,
  IntegrationsMap,
  DashboardData,
  PortalData,
  PropertyMember,
} from '@/types';

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');

const TOKEN_KEY = 'pms.token';

export function authToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// A single place for the store to react to a hard 401 (token expired/revoked).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: Record<string, string[]> | null,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Envelope<T> {
  data: T;
  message: string | null;
  meta: Record<string, unknown> | null;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Options {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Send this token instead of the stored one (used during login). */
  token?: string | null;
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(path: string, opts: Options = {}): Promise<Envelope<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = opts.token !== undefined ? opts.token : authToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let url = `${BASE_URL}${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? 'GET', headers, body, signal: opts.signal });
  } catch (cause) {
    throw new ApiError(`Could not reach the API at ${BASE_URL}. Is the Laravel server running?`, 0, null, cause);
  }

  const text = await res.text();
  const payload = text ? safeJson(text) : null;
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const message = typeof obj.message === 'string' ? obj.message : `Request to ${path} failed (${res.status})`;
    const errors = (obj.errors ?? null) as Record<string, string[]> | null;
    throw new ApiError(message, res.status, errors, payload);
  }

  return {
    data: obj.data as T,
    message: (obj.message ?? null) as string | null,
    meta: (obj.meta ?? null) as Record<string, unknown> | null,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---- Named endpoints -------------------------------------------------------

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  avatarColor: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  phone?: string;
}

export const api = {
  demoUsers: () => apiFetch<DemoUser[]>('/auth/demo-users').then((e) => e.data),

  login: (input: { role?: string; userId?: string; email?: string; password?: string }) =>
    apiFetch<{ token: string; user: unknown }>('/auth/login', { method: 'POST', body: input, token: null }).then((e) => e.data),

  register: (input: RegisterInput) =>
    apiFetch<{ token: string; user: unknown }>('/auth/register', { method: 'POST', body: input, token: null }).then((e) => e.data),

  forgotPassword: (email: string) =>
    apiFetch<{ email: string; reset_token: string; reset_url: string } | null>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      token: null,
    }),

  resetPassword: (input: { email: string; token: string; password: string; password_confirmation: string }) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: input, token: null }),

  logout: () => apiFetch('/auth/logout', { method: 'POST' }),

  me: () => apiFetch<unknown>('/auth/me').then((e) => e.data),

  bootstrap: () => apiFetch<Record<string, unknown[]>>('/bootstrap').then((e) => e.data),

  /** Recent notifications for the current user (own + role + global). */
  notifications: () =>
    apiFetch<unknown[]>('/notifications', { query: { per_page: 100 } }).then((e) => e.data),

  // ---- Online payments (Paystack) ----
  paystackInitialize: (input: { invoiceId: string; amount?: number }) =>
    apiFetch<{ authorizationUrl: string; reference: string }>('/payments/paystack/initialize', {
      method: 'POST',
      body: input,
    }).then((e) => e.data),
  paystackVerify: (reference: string) =>
    apiFetch<{ status: string; payment: unknown }>('/payments/paystack/verify', {
      method: 'POST',
      body: { reference },
    }).then((e) => e.data),
  paymentReceiptLink: (id: string) =>
    apiFetch<{ url: string | null; fileName: string | null }>(`/payments/${id}/receipt-link`).then((e) => e.data),

  // ---- Maintenance: tenant confirmation + technician payouts ----
  confirmMaintenance: (id: string) =>
    apiFetch(`/maintenance/${id}/confirm`, { method: 'POST' }),
  requestMaintenancePayout: (maintenanceId: string, body: { amount?: number; note?: string }) =>
    apiFetch(`/maintenance/${maintenanceId}/payout`, { method: 'POST', body }),
  approveMaintenancePayout: (id: string) =>
    apiFetch(`/maintenance-payouts/${id}/approve`, { method: 'POST' }),
  rejectMaintenancePayout: (id: string, reason: string) =>
    apiFetch(`/maintenance-payouts/${id}/reject`, { method: 'POST', body: { reason } }),
  payMaintenancePayout: (id: string, body: { method?: string; reference?: string }) =>
    apiFetch(`/maintenance-payouts/${id}/pay`, { method: 'POST', body }),

  // ---- Reminders ----
  sendOverdueReminders: (propertyId?: string) =>
    apiFetch<{ invoices: number; notified: number; emailed: number }>('/reminders/overdue', {
      method: 'POST',
      body: propertyId ? { propertyId } : {},
    }),

  // ---- Web Push ----
  vapidKey: () => apiFetch<{ publicKey: string | null }>('/push/vapid-key').then((e) => e.data.publicKey),
  savePushSubscription: (sub: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    contentEncoding?: string;
  }) => apiFetch('/push/subscriptions', { method: 'POST', body: sub }),
  deletePushSubscription: (endpoint: string) =>
    apiFetch('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),

  reset: () => apiFetch<Record<string, unknown[]>>('/admin/reset', { method: 'POST' }).then((e) => e.data),

  // ---- Admin dashboard rollups (server-computed) ----
  dashboard: (propertyId?: string) =>
    apiFetch<DashboardData>('/dashboard', {
      query: { propertyId: propertyId && propertyId !== 'all' ? propertyId : undefined },
    }).then((e) => e.data),
  portal: () => apiFetch<PortalData>('/portal').then((e) => e.data),
  analytics: (months?: number) =>
    apiFetch<Record<string, unknown>>('/analytics', { query: { months } }).then((e) => e.data),
  report: (kind: 'collections' | 'occupancy' | 'expenses', query?: Record<string, string>) =>
    apiFetch<Record<string, unknown>>(`/reports/${kind}`, { query }).then((e) => e.data),
  ownerStatement: (ownerId: string, from?: string, to?: string) =>
    apiFetch<Record<string, unknown>>('/reports/owner-statement', { query: { ownerId, from, to } }).then((e) => e.data),
  owners: () => apiFetch<unknown[]>('/owners').then((e) => e.data),
  staff: () => apiFetch<unknown[]>('/staff').then((e) => e.data),
  rbac: () => apiFetch<Record<string, unknown>>('/rbac').then((e) => e.data),

  // ---- Persisted admin settings ----
  organization: () => apiFetch<OrganizationSettings>('/settings/organization').then((e) => e.data),
  updateOrganization: (patch: Partial<OrganizationSettings>) =>
    apiFetch<OrganizationSettings>('/settings/organization', { method: 'PUT', body: patch }).then((e) => e.data),
  integrations: () => apiFetch<IntegrationsMap>('/integrations').then((e) => e.data),
  updateIntegrations: (patch: IntegrationsMap) =>
    apiFetch<IntegrationsMap>('/integrations', { method: 'PUT', body: patch }).then((e) => e.data),

  // ---- Team membership & invitations ----
  listInvitations: () => apiFetch<unknown[]>('/invitations').then((e) => e.data),
  acceptInvitation: (id: string) => apiFetch(`/invitations/${id}/accept`, { method: 'POST' }),
  declineInvitation: (id: string) => apiFetch(`/invitations/${id}/decline`, { method: 'POST' }),
  updateMembershipBank: (
    memberId: string,
    body: {
      bankName?: string | null;
      bankAccountName?: string | null;
      bankAccountNumber?: string | null;
      bankCode?: string | null;
    },
  ) =>
    apiFetch<PropertyMember>(`/memberships/${memberId}/bank`, { method: 'PUT', body }).then(
      (e) => e.data,
    ),
  propertyMembers: (propertyId: string) =>
    apiFetch<unknown[]>(`/properties/${propertyId}/members`).then((e) => e.data),
  inviteMember: (propertyId: string, input: { email: string; role: string }) =>
    apiFetch(`/properties/${propertyId}/invitations`, { method: 'POST', body: input }),
  revokeMember: (propertyId: string, memberId: string) =>
    apiFetch(`/properties/${propertyId}/members/${memberId}`, { method: 'DELETE' }),

  /** Generic request used by the write-through middleware. Returns `data`. */
  request: <T = unknown>(method: Method, path: string, body?: unknown) =>
    apiFetch<T>(path, { method, body }).then((e) => e.data),
};
