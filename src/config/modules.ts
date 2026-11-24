/**
 * The platform's switchable modules (mirrors the backend's App\Support\Modules). A superadmin turns each on or off;
 * the server sends the current states with the bootstrap (`data.modules`), and the app hides what is off. The server
 * is what enforces it: a request to a module that is off is refused.
 */
export type ModuleKey =
  | 'utilities'
  | 'auto-debit'
  | 'reminders'
  | 'maintenance'
  | 'payouts'
  | 'inspections'
  | 'expenses'
  | 'leasing'
  | 'documents'
  | 'communications'
  | 'planner'
  | 'reports';

/** Every module's state, as the server reports it (a module that needs another is already off when that one is). */
export type ModuleStates = Record<string, boolean>;

/** One row of GET /modules. */
export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  description: string;
  requires: ModuleKey[];
  dependents: ModuleKey[];
  enabled: boolean;
}

/**
 * Whether a module is on. Until the states have loaded (or for a key the server does not know) it counts as on: the
 * server is the one that refuses, and hiding things before we know would flash the whole app empty.
 */
export function isModuleOn(states: ModuleStates | null | undefined, key: ModuleKey | null | undefined): boolean {
  if (!key || !states) return true;
  return states[key] !== false;
}

/** Which module each screen belongs to, by path prefix. Core screens are not listed. */
const PATH_MODULES: ReadonlyArray<readonly [string, ModuleKey]> = [
  ['/utilities', 'utilities'], ['/portal/utilities', 'utilities'],
  ['/maintenance', 'maintenance'], ['/portal/maintenance', 'maintenance'],
  ['/inspections', 'inspections'],
  ['/expenses', 'expenses'], ['/vendors', 'expenses'],
  ['/listings', 'leasing'], ['/leads', 'leasing'],
  ['/documents', 'documents'], ['/portal/documents', 'documents'],
  ['/notices', 'communications'], ['/messages', 'communications'], ['/portal/notices', 'communications'], ['/portal/messages', 'communications'],
  ['/tasks', 'planner'], ['/calendar', 'planner'],
  ['/reports', 'reports'], ['/analytics', 'reports'],
];

/** The module a path belongs to, or null if it is part of the core. */
export function moduleForPath(path: string): ModuleKey | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  for (const [prefix, key] of PATH_MODULES) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return key;
  }
  return null;
}
