import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Building2, Building, DoorOpen, Users, UserSquare2, FileSignature,
  ReceiptText, CreditCard, BadgeCheck, Wallet, Wrench, Truck, ClipboardCheck,
  Megaphone, FileText, MessagesSquare, CalendarDays, ListTodo, BarChart3, PieChart,
  UserCog, Plug, Settings, Store, Contact, Gauge, Home, HandCoins,
  History, Bell, MailPlus, ToggleRight,
} from 'lucide-react';
import type { Role } from '@/types';
import { isModuleOn, moduleForPath, type ModuleStates } from '@/config/modules';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: Role[];
  /** which store counter to badge, if any */
  badge?: 'pendingVerifications' | 'openMaintenance' | 'unreadNotifications' | 'pendingInvitations';
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL_STAFF: Role[] = ['admin', 'owner', 'manager', 'agent', 'finance', 'maintenance'];
const EVERYONE: Role[] = [...ALL_STAFF, 'tenant', 'user'];

export const STAFF_NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: [...ALL_STAFF, 'user'] },
      { label: 'Notifications', path: '/notifications', icon: Bell, roles: [...ALL_STAFF, 'user'], badge: 'unreadNotifications' },
      { label: 'Invitations', path: '/invitations', icon: MailPlus, roles: EVERYONE, badge: 'pendingInvitations' },
    ],
  },
  {
    title: 'Portfolio',
    items: [
      { label: 'Properties', path: '/properties', icon: Building2, roles: ['admin', 'owner', 'manager', 'finance', 'agent', 'user'] },
      { label: 'Buildings', path: '/buildings', icon: Building, roles: ['admin', 'owner', 'manager'] },
      { label: 'Units', path: '/units', icon: DoorOpen, roles: ['admin', 'owner', 'manager'] },
      { label: 'Owners', path: '/owners', icon: Contact, roles: ['admin'] },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Tenants', path: '/tenants', icon: Users, roles: ['admin', 'owner', 'manager', 'finance'] },
      { label: 'Leases', path: '/leases', icon: FileSignature, roles: ['admin', 'owner', 'manager'] },
      { label: 'Staff', path: '/staff', icon: UserSquare2, roles: ['admin', 'owner'] },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Rent & Invoices', path: '/invoices', icon: ReceiptText, roles: ['admin', 'owner', 'manager', 'finance'] },
      { label: 'Payments', path: '/payments', icon: CreditCard, roles: ['admin', 'owner', 'manager', 'finance'] },
      { label: 'Payment Verification', path: '/payments/verification', icon: BadgeCheck, roles: ['admin', 'manager', 'finance'], badge: 'pendingVerifications' },
      { label: 'Expenses', path: '/expenses', icon: Wallet, roles: ['admin', 'owner', 'manager', 'finance'] },
      { label: 'Vendors', path: '/vendors', icon: Truck, roles: ['admin', 'manager', 'finance'] },
      { label: 'Reports', path: '/reports', icon: BarChart3, roles: ['admin', 'owner', 'manager', 'finance'] },
      { label: 'Analytics', path: '/analytics', icon: PieChart, roles: ['admin', 'owner', 'finance'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Maintenance', path: '/maintenance', icon: Wrench, roles: ['admin', 'owner', 'manager', 'maintenance'], badge: 'openMaintenance' },
      { label: 'Inspections', path: '/inspections', icon: ClipboardCheck, roles: ['admin', 'owner', 'manager', 'maintenance'] },
      { label: 'Utilities & Meters', path: '/utilities', icon: Gauge, roles: ['admin', 'owner', 'manager'] },
      { label: 'Tasks', path: '/tasks', icon: ListTodo, roles: ['admin', 'manager', 'agent', 'maintenance'] },
      { label: 'Calendar', path: '/calendar', icon: CalendarDays, roles: ['admin', 'owner', 'manager', 'agent'] },
    ],
  },
  {
    title: 'Leasing',
    items: [
      { label: 'Listings', path: '/listings', icon: Store, roles: ['admin', 'owner', 'manager', 'agent'] },
      { label: 'Leads', path: '/leads', icon: HandCoins, roles: ['admin', 'manager', 'agent'] },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Notices', path: '/notices', icon: Megaphone, roles: [...ALL_STAFF, 'user'] },
      { label: 'Messages', path: '/messages', icon: MessagesSquare, roles: [...ALL_STAFF, 'user'] },
      { label: 'Documents', path: '/documents', icon: FileText, roles: ['admin', 'owner', 'manager', 'finance'] },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Users & Roles', path: '/users', icon: UserCog, roles: ['admin'] },
      { label: 'Audit Logs', path: '/audit', icon: History, roles: ['admin', 'finance'] },
      { label: 'Integrations', path: '/integrations', icon: Plug, roles: ['admin'] },
      { label: 'Modules', path: '/modules', icon: ToggleRight, roles: ['superadmin'] },
      { label: 'Settings', path: '/settings', icon: Settings, roles: [...ALL_STAFF, 'user'] },
    ],
  },
];

export const TENANT_NAV: NavGroup[] = [
  {
    title: 'My Home',
    items: [
      { label: 'Overview', path: '/portal', icon: Home, roles: ['tenant'] },
      { label: 'Notifications', path: '/notifications', icon: Bell, roles: ['tenant'], badge: 'unreadNotifications' },
      { label: 'My Lease', path: '/portal/lease', icon: FileSignature, roles: ['tenant'] },
      { label: 'Utilities', path: '/portal/utilities', icon: Gauge, roles: ['tenant'] },
    ],
  },
  {
    title: 'Payments',
    items: [
      { label: 'Bills & Invoices', path: '/portal/bills', icon: ReceiptText, roles: ['tenant'] },
      { label: 'Make a Payment', path: '/portal/pay', icon: CreditCard, roles: ['tenant'] },
      { label: 'Payment History', path: '/portal/payments', icon: History, roles: ['tenant'] },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Maintenance', path: '/portal/maintenance', icon: Wrench, roles: ['tenant'] },
      { label: 'Documents', path: '/portal/documents', icon: FileText, roles: ['tenant'] },
      { label: 'Notices', path: '/portal/notices', icon: Megaphone, roles: ['tenant'] },
      { label: 'Messages', path: '/portal/messages', icon: MessagesSquare, roles: ['tenant'] },
    ],
  },
];

/**
 * The menu for a role. A screen that belongs to a module that is off is left out (see moduleForPath); with the states
 * not loaded yet nothing is hidden.
 */
export function navForRole(role: Role, modules?: ModuleStates | null): NavGroup[] {
  const visible = (i: NavItem) => isModuleOn(modules, moduleForPath(i.path));
  if (role === 'tenant') {
    return TENANT_NAV.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length > 0);
  }
  return STAFF_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (i.roles.includes(role) || (role === 'superadmin' && i.roles.includes('admin'))) && visible(i)),
  })).filter((g) => g.items.length > 0);
}

export const NOTIF_ICON = Bell;
