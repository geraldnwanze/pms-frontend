import type { AppDispatch, RootState } from './index';
import { dataActions } from './dataSlice';
import { login, logout, dataReady } from './authSlice';
import { pushToast } from './uiSlice';
import { api, ApiError, setAuthToken, type RegisterInput } from '@/lib/api';
import { uid } from '@/lib/format';
import { sessionEndedMessage } from '@/lib/session';
import type { SeedData } from '@/data/seed';
import type { Role, User } from '@/types';

type Thunk<R = void> = (dispatch: AppDispatch, getState: () => RootState) => Promise<R>;

function toast(dispatch: AppDispatch, kind: 'success' | 'error' | 'info', message: string) {
  dispatch(pushToast({ id: uid('t'), kind, message }));
}

/** Say why the user is back at the sign-in page — once, however many requests failed together. */
export function announceSessionEnded(dispatch: AppDispatch, getState: () => RootState, err: ApiError): void {
  const message = sessionEndedMessage(err);
  if (!getState().ui.toasts.some((t) => t.message === message)) toast(dispatch, 'info', message);
}

let checkingModules = false;

/**
 * Ask the server which modules are on and, only if that differs from what the app knows, reload everything so the menu, the
 * screens and the data follow. This is the catch-up for a change the app was never refused over (a module switched back on, or
 * off in a screen nobody has touched). One check at a time; any failure is ignored (the next one will try again); nothing happens
 * before the app has loaded or when nobody is signed in.
 */
export function syncModules(): Thunk<boolean> {
  return async (dispatch, getState) => {
    const known = getState().data.modules;
    if (checkingModules || !getState().auth.currentUserId || !getState().auth.dataReady || !known) return false;
    checkingModules = true;
    try {
      const rows = await api.modules();
      const changed = rows.some((r) => (known[r.key] !== false) !== r.enabled);
      if (changed) await dispatch(bootstrap());
      return changed;
    } catch {
      return false;
    } finally {
      checkingModules = false;
    }
  };
}

let refreshingForModule = false;

/**
 * A request was refused because its module is turned off. If the app did not already know, a superadmin switched it off since this
 * page loaded: say so once and reload, so the menu, the screens and the data follow. If the app already knew, nothing changes
 * (the failing request is a screen that has not caught up, and reloading again would not help). One reload at a time, however
 * many requests fail together.
 */
export function moduleTurnedOff(module: string, message: string): Thunk {
  return async (dispatch, getState) => {
    if (refreshingForModule || !getState().auth.currentUserId) return;
    if (getState().data.modules?.[module] === false) return;
    refreshingForModule = true;
    try {
      if (!getState().ui.toasts.some((t) => t.message === message)) toast(dispatch, 'info', message);
      await dispatch(bootstrap());
    } finally {
      refreshingForModule = false;
    }
  };
}

/** Pull the full (RBAC-scoped) dataset from the v1 API into the store. */
export function bootstrap(): Thunk<boolean> {
  return async (dispatch, getState) => {
    try {
      const data = await api.bootstrap();
      dispatch(dataActions.hydrateAll(data as unknown as Partial<SeedData>));
      dispatch(dataReady(true));
      // Refresh the server-computed dashboard rollup alongside the raw dataset so
      // it converges after every mutation (apiMiddleware re-bootstraps). Tenants
      // get the resident-portal rollup; everyone else the persona dashboard.
      const s = getState();
      const me = s.data.users.find((u) => u.id === s.auth.currentUserId);
      if (me?.role === 'tenant') void dispatch(fetchPortal());
      else void dispatch(fetchDashboard());
      return true;
    } catch (err) {
      // Stale/rejected token — drop the session and send the user to /login.
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null);
        dispatch(logout());
        dispatch(dataActions.resetData());
        announceSessionEnded(dispatch, getState, err);
        return false;
      }
      const message = err instanceof ApiError ? err.message : 'Failed to load data from the server.';
      toast(dispatch, 'error', message);
      return false;
    }
  };
}

/**
 * Refresh the server-computed dashboard rollup (GET /api/v1/dashboard),
 * honouring the global property filter. The payload is tailored to the
 * caller's persona (portfolio / finance / operations / leasing / maintenance).
 * Non-fatal: on failure the Dashboard view falls back to client-side
 * aggregation over the bootstrapped dataset.
 */
export function fetchDashboard(): Thunk<boolean> {
  return async (dispatch, getState) => {
    try {
      const filter = getState().ui.propertyFilter;
      const dashboard = await api.dashboard(filter);
      dispatch(dataActions.setDashboard(dashboard));
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      return false;
    }
  };
}

/**
 * Refresh the server-computed resident home rollup (GET /api/v1/portal).
 * Non-fatal: on failure the portal falls back to client-side aggregation.
 */
export function fetchPortal(): Thunk<boolean> {
  return async (dispatch) => {
    try {
      const portal = await api.portal();
      dispatch(dataActions.setPortal(portal));
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      return false;
    }
  };
}

/**
 * Poll the notification feed (GET /notifications). Backs up the real-time
 * Reverb stream so anything missed while offline still shows up.
 */
export function fetchNotifications(): Thunk<boolean> {
  return async (dispatch) => {
    try {
      const list = await api.notifications();
      dispatch(dataActions.setNotifications(list as SeedData['notifications']));
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      return false;
    }
  };
}

async function completeSession(
  dispatch: AppDispatch,
  run: () => Promise<{ token: string; user: unknown }>,
  failMessage: string,
): Promise<User | null> {
  try {
    const { token, user } = await run();
    const u = user as User;
    setAuthToken(token);
    dispatch(login({ userId: u.id, token }));
    await dispatch(bootstrap());
    return u;
  } catch (err) {
    const message = err instanceof ApiError ? fieldError(err) ?? err.message : failMessage;
    toast(dispatch, 'error', message);
    return null;
  }
}

function fieldError(err: ApiError): string | undefined {
  return err.errors ? Object.values(err.errors).flat()[0] : undefined;
}

/** Sign in as the first account with the given role (demo role picker). */
export function signInAsRole(role: Role): Thunk<User | null> {
  return (dispatch) => completeSession(dispatch, () => api.login({ role }), 'Sign in failed.');
}

/** Sign in as a specific seeded demo account (one-click list on the login page). */
export function signInAsUser(userId: string): Thunk<User | null> {
  return (dispatch) => completeSession(dispatch, () => api.login({ userId }), 'Sign in failed.');
}

/** Sign in with real credentials. */
export function signInWithPassword(email: string, password: string): Thunk<User | null> {
  return (dispatch) => completeSession(dispatch, () => api.login({ email, password }), 'Sign in failed.');
}

/** Create a new account and sign it straight in. */
export function registerAccount(input: RegisterInput): Thunk<User | null> {
  return (dispatch) => completeSession(dispatch, () => api.register(input), 'Registration failed.');
}

/** Switch to another seeded account (demo account switcher in the top bar). */
export function switchUser(userId: string): Thunk<User | null> {
  return (dispatch) => completeSession(dispatch, () => api.login({ userId }), 'Could not switch account.');
}

/** Kick off a password reset. Returns the dev reset URL when the API exposes it. */
export function requestPasswordReset(email: string): Thunk<{ ok: boolean; devUrl?: string }> {
  return async (dispatch) => {
    try {
      const { data, message } = await api.forgotPassword(email);
      toast(dispatch, 'success', message ?? 'Check your email for a reset link.');
      return { ok: true, devUrl: data?.reset_url };
    } catch (err) {
      const message = err instanceof ApiError ? fieldError(err) ?? err.message : 'Could not start the reset.';
      toast(dispatch, 'error', message);
      return { ok: false };
    }
  };
}

export function performPasswordReset(input: {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
}): Thunk<boolean> {
  return async (dispatch) => {
    try {
      await api.resetPassword(input);
      toast(dispatch, 'success', 'Password updated — sign in with your new password.');
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? fieldError(err) ?? err.message : 'Reset failed.';
      toast(dispatch, 'error', message);
      return false;
    }
  };
}

export function signOut(): Thunk {
  return async (dispatch) => {
    try {
      const { teardownPush } = await import('@/lib/push');
      await teardownPush(); // unsubscribe this device while the token is still valid
    } catch {
      /* best effort */
    }
    try {
      await api.logout();
    } catch {
      /* best effort */
    }
    setAuthToken(null);
    dispatch(logout());
    dispatch(dataActions.resetData());
  };
}

/** Admin-only: re-seed the backend and re-hydrate in place. */
export function resetDemoData(): Thunk {
  return async (dispatch) => {
    try {
      await api.reset();
      await dispatch(bootstrap());
      toast(dispatch, 'success', 'Demo data reset to its original state.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Reset failed.';
      toast(dispatch, 'error', message);
    }
  };
}

// ---- Team membership & invitations --------------------------------------

export function acceptInvitation(id: string): Thunk<boolean> {
  return async (dispatch) => {
    try {
      await api.acceptInvitation(id);
      await dispatch(bootstrap());
      toast(dispatch, 'success', 'Invitation accepted — welcome to the team.');
      return true;
    } catch (err) {
      toast(dispatch, 'error', err instanceof ApiError ? err.message : 'Could not accept the invitation.');
      return false;
    }
  };
}

export function declineInvitation(id: string): Thunk<boolean> {
  return async (dispatch) => {
    try {
      await api.declineInvitation(id);
      await dispatch(bootstrap());
      toast(dispatch, 'info', 'Invitation declined.');
      return true;
    } catch (err) {
      toast(dispatch, 'error', err instanceof ApiError ? err.message : 'Could not decline the invitation.');
      return false;
    }
  };
}

export function inviteMember(propertyId: string, email: string, role: string): Thunk<boolean> {
  return async (dispatch) => {
    try {
      await api.inviteMember(propertyId, { email: email.trim(), role });
      await dispatch(bootstrap());
      toast(dispatch, 'success', `Invitation sent to ${email.trim()}.`);
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? fieldError(err) ?? err.message : 'Could not send the invitation.';
      toast(dispatch, 'error', message);
      return false;
    }
  };
}

export function saveMembershipBank(
  memberId: string,
  body: {
    bankName?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankCode?: string | null;
  },
): Thunk<boolean> {
  return async (dispatch) => {
    try {
      await api.updateMembershipBank(memberId, body);
      await dispatch(bootstrap());
      toast(dispatch, 'success', 'Payout details saved.');
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError ? fieldError(err) ?? err.message : 'Could not save the payout details.';
      toast(dispatch, 'error', message);
      return false;
    }
  };
}

// ---- Admin settings ---------------------------------------------------

export function saveOrganization(patch: Partial<import('@/types').OrganizationSettings>): Thunk<boolean> {
  return async (dispatch, getState) => {
    try {
      const settings = await api.updateOrganization(patch);
      dispatch(dataActions.hydrateAll({ ...getState().data, settings }));
      toast(dispatch, 'success', 'Organization settings saved.');
      return true;
    } catch (err) {
      toast(dispatch, 'error', err instanceof ApiError ? fieldError(err) ?? err.message : 'Could not save.');
      return false;
    }
  };
}

export function saveIntegrations(patch: import('@/types').IntegrationsMap): Thunk<boolean> {
  return async (dispatch, getState) => {
    try {
      const integrations = await api.updateIntegrations(patch);
      dispatch(dataActions.hydrateAll({ ...getState().data, integrations }));
      return true;
    } catch (err) {
      toast(dispatch, 'error', err instanceof ApiError ? fieldError(err) ?? err.message : 'Could not save.');
      return false;
    }
  };
}

// ---- Platform modules (superadmin) --------------------------------------

/**
 * Switch a module on or off. Switching one off also switches off the modules that need it; until `cascade` is set the server
 * refuses with a list of those, which comes back here as `dependents` for the caller to confirm. On success the store is
 * reloaded, so the menu, the screens and the data all follow the new states.
 */
export function setModuleEnabled(key: string, enabled: boolean, cascade = false): Thunk<{ ok: boolean; dependents?: string[] }> {
  return async (dispatch) => {
    try {
      await api.setModule(key, enabled, cascade);
      await dispatch(bootstrap());
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors?.dependents) {
        return { ok: false, dependents: err.errors.dependents };
      }
      toast(dispatch, 'error', err instanceof ApiError ? fieldError(err) ?? err.message : 'Could not change the module.');
      return { ok: false };
    }
  };
}

// ---- Maintenance: tenant confirmation & technician payouts ---------------

function maintenanceAction(
  run: () => Promise<unknown>,
  ok: string,
  fail: string,
): Thunk<boolean> {
  return async (dispatch) => {
    try {
      await run();
      await dispatch(bootstrap());
      toast(dispatch, 'success', ok);
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? fieldError(err) ?? err.message : fail;
      toast(dispatch, 'error', message);
      return false;
    }
  };
}

export function confirmMaintenanceDone(id: string): Thunk<boolean> {
  return maintenanceAction(() => api.confirmMaintenance(id), 'Thanks — the work is confirmed.', 'Could not confirm the work.');
}

export function requestMaintenancePayout(maintenanceId: string, body: { amount?: number; note?: string }): Thunk<boolean> {
  return maintenanceAction(() => api.requestMaintenancePayout(maintenanceId, body), 'Payment requested.', 'Could not request payment.');
}

export function approveMaintenancePayout(id: string): Thunk<boolean> {
  return maintenanceAction(() => api.approveMaintenancePayout(id), 'Payout approved.', 'Could not approve the payout.');
}

export function rejectMaintenancePayout(id: string, reason: string): Thunk<boolean> {
  return maintenanceAction(() => api.rejectMaintenancePayout(id, reason), 'Payout rejected.', 'Could not reject the payout.');
}

export function payMaintenancePayout(id: string, body: { method?: string; reference?: string }): Thunk<boolean> {
  return maintenanceAction(() => api.payMaintenancePayout(id, body), 'Payout marked as paid.', 'Could not record the payment.');
}

export function revokeMember(propertyId: string, memberId: string): Thunk<boolean> {
  return async (dispatch) => {
    try {
      await api.revokeMember(propertyId, memberId);
      await dispatch(bootstrap());
      toast(dispatch, 'info', 'Member removed.');
      return true;
    } catch (err) {
      toast(dispatch, 'error', err instanceof ApiError ? fieldError(err) ?? err.message : 'Could not remove the member.');
      return false;
    }
  };
}
