import dayjs from 'dayjs';

// ---- Currency (Nigerian Naira per the spec examples) -----------------------

export function formatCurrency(amount: number, opts?: { compact?: boolean }): string {
  // The sign goes in front of the symbol: -₦350,000, not ₦-350,000.
  const sign = Math.round(amount) < 0 || (opts?.compact && amount < 0) ? '-' : '';
  const abs = Math.abs(amount);
  if (opts?.compact) {
    if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}₦${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}₦${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}₦${Math.round(abs).toLocaleString('en-NG')}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-NG');
}

export function formatPercent(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

// ---- Dates -----------------------------------------------------------------

/** The fixed "today" the deterministic demo dataset (src/data/seed.ts) is generated against. Never use at runtime. */
export const SEED_TODAY = '2026-08-25';

/** Today's date (local) as YYYY-MM-DD. A function, not a constant, so it can't go stale in a tab left open past midnight. */
export function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function formatDate(date?: string): string {
  if (!date) return '—';
  return dayjs(date).format('DD MMM YYYY');
}

export function formatDateTime(date?: string): string {
  if (!date) return '—';
  return dayjs(date).format('DD MMM YYYY, HH:mm');
}

export function fromNow(date?: string): string {
  if (!date) return '—';
  const d = dayjs(date);
  const now = dayjs(today());
  const days = now.diff(d, 'day');
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 0 && days < 30) return `${days}d ago`;
  if (days < 0 && days > -30) return `in ${Math.abs(days)}d`;
  const months = now.diff(d, 'month');
  if (months !== 0) return months > 0 ? `${months}mo ago` : `in ${Math.abs(months)}mo`;
  return d.format('DD MMM YYYY');
}

export function daysBetween(a: string, b: string): number {
  return dayjs(b).diff(dayjs(a), 'day');
}

export function daysUntil(date: string): number {
  return dayjs(date).diff(dayjs(today()), 'day');
}

export function daysOverdue(dueDate: string): number {
  const d = dayjs(today()).diff(dayjs(dueDate), 'day');
  return d > 0 ? d : 0;
}

export function addMonths(date: string, months: number): string {
  return dayjs(date).add(months, 'month').format('YYYY-MM-DD');
}

// ---- Seeded pseudo-random generator (deterministic mock data) --------------
// mulberry32 — small, fast, good enough for demo data. Never uses Date.now().

export function createRng(seed: number) {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Misc helpers ----------------------------------------------------------

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function classNames(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ');
}

let idCounter = 0;
/** Deterministic id generator for seed time (no randomness / no Date). */
export function seqId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36).padStart(5, '0')}`;
}

/** Runtime unique id (used inside reducers for newly-created entities). */
export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/** Current ISO timestamp (runtime only). */
export function nowIso(): string {
  return new Date().toISOString();
}
