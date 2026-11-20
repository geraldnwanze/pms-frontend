import { periodShare } from '@/lib/billing';
import type {
  MaintenancePayout,
  User, Property, Building, Unit, Tenant, Lease, Invoice, Payment,
  MaintenanceRequest, MaintenanceRound, Expense, Vendor, Inspection, Meter, Listing, Lead,
  DocumentRecord, AppNotification, Notice, Message, AuditLog, TaskItem,
  CalendarEvent, PropertyMember, OrganizationSettings, IntegrationsMap, RbacMatrix, DashboardData, PortalData,
  PropertyType, UnitStatus, PaymentMethod, BillingCycle,
  InvoiceStatus, LeaseStatus,
} from '@/types';
import {
  createRng, pick, randInt, shuffle, seqId, addMonths, daysBetween, SEED_TODAY as TODAY,
} from '@/lib/format';
import dayjs from 'dayjs';

/** The organization's default late-fee policy — keep in step with SettingsService::DEFAULTS in the backend. */
const LATE_FEE_PERCENT = 10;
const LATE_FEE_GRACE_DAYS = 5;

export interface SeedData {
  users: User[];
  properties: Property[];
  buildings: Building[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  invoices: Invoice[];
  payments: Payment[];
  maintenance: MaintenanceRequest[];
  expenses: Expense[];
  vendors: Vendor[];
  inspections: Inspection[];
  meters: Meter[];
  listings: Listing[];
  leads: Lead[];
  documents: DocumentRecord[];
  notifications: AppNotification[];
  notices: Notice[];
  messages: Message[];
  audit: AuditLog[];
  tasks: TaskItem[];
  events: CalendarEvent[];
  /** Technician payout requests for completed work orders. */
  maintenancePayouts: MaintenancePayout[];
  /** The current user's property memberships (populated by the API, not the local seed). */
  memberships: PropertyMember[];
  /** The current user's pending invitations (populated by the API). */
  invitations: PropertyMember[];
  /** Organization profile (backend singleton). */
  settings: OrganizationSettings | null;
  /** Integration toggles (backend singleton). */
  integrations: IntegrationsMap;
  /** Authoritative RBAC matrix from the backend. */
  rbac: RbacMatrix | null;
  /** Server-computed overview rollup (GET /api/v1/dashboard), tailored per persona. */
  dashboard: DashboardData | null;
  /** Server-computed resident home rollup (GET /api/v1/portal). */
  portal: PortalData | null;
}

// ---- Name & value pools ----------------------------------------------------

const FIRST = ['Chidi', 'Amara', 'Emeka', 'Ngozi', 'Tunde', 'Bisi', 'Yusuf', 'Fatima', 'Ifeoma', 'Segun', 'Aisha', 'Obinna', 'Zainab', 'Kunle', 'Chioma', 'Musa', 'Folake', 'Uche', 'Halima', 'Bola', 'Nneka', 'Ibrahim', 'Adaeze', 'Femi', 'Hauwa', 'Chukwu', 'Blessing', 'Sadiq', 'Temi', 'Ada'];
const LAST = ['Okafor', 'Adeyemi', 'Balogun', 'Ibrahim', 'Nwosu', 'Okoro', 'Bello', 'Eze', 'Abubakar', 'Chukwu', 'Adebayo', 'Mohammed', 'Ogunleye', 'Uzoma', 'Danladi', 'Obi', 'Yakubu', 'Afolabi', 'Onyeka', 'Suleiman'];
const AVATAR_COLORS = ['#059669', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#2563eb', '#65a30d', '#c026d3', '#0d9488', '#d97706'];

const AMENITIES = ['24/7 Security', 'Borehole Water', 'Standby Generator', 'Swimming Pool', 'Gym', 'Elevator', 'Parking', 'CCTV', 'Playground', 'Green Area', 'Solar Backup', 'Fibre Internet', 'Fire Safety', 'Waste Management'];

const CITIES: { city: string; state: string; lat: number; lng: number }[] = [
  { city: 'Lagos', state: 'Lagos', lat: 6.5244, lng: 3.3792 },
  { city: 'Lekki', state: 'Lagos', lat: 6.4698, lng: 3.5852 },
  { city: 'Abuja', state: 'FCT', lat: 9.0765, lng: 7.3986 },
  { city: 'Port Harcourt', state: 'Rivers', lat: 4.8156, lng: 7.0498 },
  { city: 'Ibadan', state: 'Oyo', lat: 7.3775, lng: 3.947 },
  { city: 'Enugu', state: 'Enugu', lat: 6.5244, lng: 7.5186 },
];

const STREETS = ['Admiralty Way', 'Bourdillon Road', 'Aminu Kano Crescent', 'Ozumba Mbadiwe Ave', 'Awolowo Road', 'Ademola Adetokunbo St', 'Herbert Macaulay Way', 'Ahmadu Bello Way', 'Chief Yesufu St', 'Marina Road'];

const RESIDENTIAL_UNIT_TYPES = ['Studio Apartment', '1-Bedroom Flat', '2-Bedroom Flat', '3-Bedroom Flat', '4-Bedroom Duplex', 'Penthouse'];
const COMMERCIAL_UNIT_TYPES = ['Retail Shop', 'Office Suite', 'Open Floor Office', 'Showroom', 'Warehouse Bay'];

const MAINT_CATEGORIES = ['Plumbing', 'Electrical', 'HVAC / AC', 'Carpentry', 'Painting', 'Appliance', 'Structural', 'Pest Control', 'Cleaning'];
const MAINT_TITLES: Record<string, string[]> = {
  Plumbing: ['Leaking kitchen sink', 'Blocked toilet', 'No water supply', 'Burst pipe in bathroom'],
  Electrical: ['Power socket not working', 'Frequent tripping', 'Faulty light fixtures', 'DB board sparking'],
  'HVAC / AC': ['AC not cooling', 'AC making noise', 'AC water dripping'],
  Carpentry: ['Broken wardrobe door', 'Loose kitchen cabinet', 'Damaged door frame'],
  Painting: ['Peeling wall paint', 'Water stain on ceiling', 'Repaint after leak'],
  Appliance: ['Water heater fault', 'Cooker igniter broken', 'Extractor fan not working'],
  Structural: ['Cracked wall', 'Sagging ceiling', 'Loose floor tiles'],
  'Pest Control': ['Rodent infestation', 'Cockroach treatment needed'],
  Cleaning: ['Deep clean before move-in', 'Drainage cleaning'],
};

const VENDOR_SERVICES = ['Plumbing & Fittings', 'Electrical Works', 'HVAC Services', 'General Contractor', 'Cleaning Services', 'Security Services', 'Landscaping', 'Pest Control'];

// ---- Generator -------------------------------------------------------------

// Seed-time day math is pinned to the fixed seed date, not the real clock.
const daysUntil = (date: string) => daysBetween(TODAY, date);

export function generateSeed(): SeedData {
  const rng = createRng(20260825);
  const fullName = () => `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
  const color = () => pick(rng, AVATAR_COLORS);
  const emailFor = (name: string, domain = 'example.com') =>
    `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${domain}`;
  const phone = () => `+234 ${randInt(rng, 700, 909)} ${randInt(rng, 100, 999)} ${randInt(rng, 1000, 9999)}`;

  const users: User[] = [];
  const properties: Property[] = [];
  const buildings: Building[] = [];
  const units: Unit[] = [];
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const maintenance: MaintenanceRequest[] = [];
  const expenses: Expense[] = [];
  const vendors: Vendor[] = [];
  const inspections: Inspection[] = [];
  const meters: Meter[] = [];
  const listings: Listing[] = [];
  const leads: Lead[] = [];
  const documents: DocumentRecord[] = [];
  const notifications: AppNotification[] = [];
  const notices: Notice[] = [];
  const messages: Message[] = [];
  const audit: AuditLog[] = [];
  const tasks: TaskItem[] = [];
  const events: CalendarEvent[] = [];

  // --- Owners & core staff ---
  const owner1: User = {
    id: 'owner_1', name: 'John Property Holdings', email: 'owner@johnholdings.com',
    phone: phone(), role: 'owner', avatarColor: '#059669', title: 'Portfolio Owner',
    twoFactorEnabled: true, status: 'active', lastLoginAt: `${TODAY}T08:12:00`,
  };
  const owner2: User = {
    id: 'owner_2', name: 'Adeyemi Estates Ltd', email: 'info@adeyemiestates.com',
    phone: phone(), role: 'owner', avatarColor: '#7c3aed', title: 'Portfolio Owner',
    twoFactorEnabled: false, status: 'active', lastLoginAt: `2026-08-24T17:40:00`,
  };
  const admin: User = {
    id: 'admin_1', name: 'Sarah Okonkwo', email: 'admin@pms.africa', phone: phone(),
    role: 'admin', avatarColor: '#0f172a', title: 'Super Administrator',
    twoFactorEnabled: true, status: 'active', lastLoginAt: `${TODAY}T07:55:00`,
  };
  users.push(admin, owner1, owner2);

  const financeUser: User = {
    id: 'finance_1', name: 'Daniel Balogun', email: 'finance@pms.africa', phone: phone(),
    role: 'finance', avatarColor: '#0891b2', title: 'Finance Officer', ownerId: 'owner_1',
    twoFactorEnabled: true, status: 'active', lastLoginAt: `${TODAY}T09:02:00`,
  };
  users.push(financeUser);

  const managers: User[] = [];
  for (let i = 0; i < 3; i++) {
    const name = fullName();
    managers.push({
      id: `mgr_${i + 1}`, name, email: emailFor(name, 'pms.africa'), phone: phone(),
      role: 'manager', avatarColor: color(), title: 'Property Manager',
      ownerId: i < 2 ? 'owner_1' : 'owner_2', assignedPropertyIds: [],
      twoFactorEnabled: rng() > 0.5, status: 'active', lastLoginAt: `${TODAY}T0${randInt(rng, 6, 9)}:1${randInt(rng, 0, 9)}:00`,
    });
  }
  users.push(...managers);

  const agents: User[] = [];
  for (let i = 0; i < 2; i++) {
    const name = fullName();
    agents.push({
      id: `agt_${i + 1}`, name, email: emailFor(name, 'pms.africa'), phone: phone(),
      role: 'agent', avatarColor: color(), title: 'Real Estate Agent',
      ownerId: 'owner_1', assignedPropertyIds: [],
      twoFactorEnabled: false, status: 'active', lastLoginAt: `2026-08-2${randInt(rng, 0, 4)}T1${randInt(rng, 0, 8)}:00:00`,
    });
  }
  users.push(...agents);

  const techs: User[] = [];
  for (let i = 0; i < 3; i++) {
    const name = fullName();
    techs.push({
      id: `tech_${i + 1}`, name, email: emailFor(name, 'pms.africa'), phone: phone(),
      role: 'maintenance', avatarColor: color(), title: 'Maintenance Technician',
      ownerId: 'owner_1', twoFactorEnabled: false, status: 'active',
      lastLoginAt: `2026-08-2${randInt(rng, 0, 4)}T08:00:00`,
    });
  }
  users.push(...techs);

  // --- Vendors ---
  for (let i = 0; i < 8; i++) {
    const name = `${pick(rng, ['Prime', 'Alpha', 'Sterling', 'Reliable', 'Bluewave', 'GreenField', 'Metro', 'Apex'])} ${pick(rng, ['Facilities', 'Services', 'Works', 'Solutions', 'Contractors'])}`;
    vendors.push({
      id: `vnd_${i + 1}`, name, service: VENDOR_SERVICES[i % VENDOR_SERVICES.length],
      phone: phone(), email: emailFor(name, 'vendor.ng'), ownerId: 'owner_1',
      totalPaid: 0, outstanding: 0,
    });
  }

  // --- Property blueprints ---
  const blueprints: { name: string; type: PropertyType; ownerId: string; buildings: number; unitsPerBuilding: number; baseRent: number }[] = [
    { name: 'Admiralty Court', type: 'residential', ownerId: 'owner_1', buildings: 2, unitsPerBuilding: 12, baseRent: 3_500_000 },
    { name: 'Marina Heights', type: 'mixed-use', ownerId: 'owner_1', buildings: 3, unitsPerBuilding: 10, baseRent: 4_200_000 },
    { name: 'Palm Grove Estate', type: 'estate', ownerId: 'owner_1', buildings: 2, unitsPerBuilding: 14, baseRent: 2_800_000 },
    { name: 'Landmark Business Park', type: 'commercial', ownerId: 'owner_1', buildings: 2, unitsPerBuilding: 8, baseRent: 6_500_000 },
    { name: 'Cedar Residences', type: 'residential', ownerId: 'owner_1', buildings: 1, unitsPerBuilding: 16, baseRent: 2_200_000 },
    { name: 'Harmony Gardens', type: 'residential', ownerId: 'owner_2', buildings: 2, unitsPerBuilding: 10, baseRent: 1_900_000 },
    { name: 'Summit Industrial Yard', type: 'industrial', ownerId: 'owner_2', buildings: 1, unitsPerBuilding: 6, baseRent: 5_000_000 },
  ];

  const billingCycles: BillingCycle[] = ['annual', 'annual', 'monthly', 'quarterly'];

  blueprints.forEach((bp, pIdx) => {
    const loc = pick(rng, CITIES);
    const managerPool = managers.filter((m) => m.ownerId === bp.ownerId);
    const manager = managerPool[pIdx % Math.max(1, managerPool.length)] ?? managers[0];
    const propId = `prop_${pIdx + 1}`;
    manager.assignedPropertyIds?.push(propId);
    if (bp.ownerId === 'owner_1') agents[pIdx % agents.length].assignedPropertyIds?.push(propId);

    const yearBuilt = randInt(rng, 2008, 2021);
    const property: Property = {
      id: propId,
      code: `PROP-${(pIdx + 1).toString().padStart(3, '0')}`,
      name: bp.name,
      type: bp.type,
      status: pIdx === 6 ? 'renovation' : 'active',
      owners: [{ ownerId: bp.ownerId, percentage: 100 }],
      managerId: manager.id,
      assignedStaffIds: [manager.id, ...techs.slice(0, 2).map((t) => t.id)],
      address: `${randInt(rng, 1, 120)} ${pick(rng, STREETS)}`,
      city: loc.city, state: loc.state, country: 'Nigeria',
      lat: loc.lat + (rng() - 0.5) * 0.08, lng: loc.lng + (rng() - 0.5) * 0.08,
      description: `${bp.name} is a well-positioned ${bp.type} property in ${loc.city}, offering modern facilities and professional on-site management.`,
      landSizeSqm: randInt(rng, 1200, 8000),
      builtUpAreaSqm: randInt(rng, 900, 6500),
      yearBuilt,
      renovationHistory: rng() > 0.5 ? `Common areas renovated in ${randInt(rng, yearBuilt + 2, 2025)}.` : undefined,
      amenities: shuffle(rng, AMENITIES).slice(0, randInt(rng, 5, 9)),
      photos: [color(), color(), color()],
      acquisitionDate: `${randInt(rng, 2015, 2022)}-0${randInt(rng, 1, 9)}-1${randInt(rng, 0, 5)}`,
      acquisitionValue: randInt(rng, 250, 1200) * 1_000_000,
      estimatedValue: randInt(rng, 400, 2200) * 1_000_000,
      insuranceProvider: pick(rng, ['Leadway Assurance', 'AIICO Insurance', 'AXA Mansard', 'Cornerstone Insurance']),
      insuranceExpiry: addMonths(TODAY, randInt(rng, -2, 10)),
      taxReference: `TAX/${loc.state.slice(0, 2).toUpperCase()}/${randInt(rng, 10000, 99999)}`,
      createdAt: `${randInt(rng, 2015, 2022)}-01-15`,
    };
    properties.push(property);

    // Buildings + units
    const cycle = billingCycles[pIdx % billingCycles.length];
    for (let b = 0; b < bp.buildings; b++) {
      const floors = randInt(rng, 2, 6);
      const bId = `bld_${pIdx + 1}_${b + 1}`;
      const building: Building = {
        id: bId, propertyId: propId,
        name: `Block ${String.fromCharCode(65 + b)}`,
        code: `${property.code}-B${b + 1}`,
        floors,
        description: `${floors}-floor block within ${bp.name}.`,
      };
      buildings.push(building);

      const unitTypes = bp.type === 'commercial' || bp.type === 'industrial'
        ? COMMERCIAL_UNIT_TYPES : RESIDENTIAL_UNIT_TYPES;

      for (let u = 0; u < bp.unitsPerBuilding; u++) {
        const uType = pick(rng, unitTypes);
        const beds = /Studio/.test(uType) ? 0 : /1-Bed/.test(uType) ? 1 : /2-Bed/.test(uType) ? 2 : /3-Bed/.test(uType) ? 3 : /4-Bed|Duplex|Penthouse/.test(uType) ? 4 : 0;
        const rentVariance = 0.8 + rng() * 0.5;
        const rent = Math.round((bp.baseRent * rentVariance) / 50000) * 50000;
        // Status distribution: ~82% occupied
        const roll = rng();
        let status: UnitStatus;
        if (property.status === 'renovation') status = roll < 0.5 ? 'renovation' : roll < 0.7 ? 'maintenance' : 'available';
        else if (roll < 0.82) status = 'occupied';
        else if (roll < 0.9) status = 'available';
        else if (roll < 0.95) status = 'reserved';
        else status = 'maintenance';

        const uId = `unit_${pIdx + 1}_${b + 1}_${u + 1}`;
        const meterId = `mtr_${uId}`;
        const unit: Unit = {
          id: uId, buildingId: bId, propertyId: propId,
          code: `${String.fromCharCode(65 + b)}${(u + 1).toString().padStart(2, '0')}`,
          type: uType, floor: randInt(rng, 0, floors - 1),
          sizeSqm: beds > 0 ? 40 + beds * randInt(rng, 18, 30) : randInt(rng, 30, 120),
          bedrooms: beds, bathrooms: Math.max(1, beds), furnishing: pick(rng, ['unfurnished', 'semi-furnished', 'furnished']),
          parkingSpaces: randInt(rng, 0, 2), status,
          rent, serviceCharge: Math.round(rent * 0.12 / 10000) * 10000,
          securityDeposit: rent, utilityCharge: randInt(rng, 15, 60) * 1000,
          otherCharges: rng() > 0.7 ? randInt(rng, 10, 40) * 1000 : 0,
          meterIds: [meterId],
        };
        units.push(unit);

        // Meter
        const prev = randInt(rng, 1000, 5000);
        const meterNumber = `MTR-${randInt(rng, 100000, 999999)}`;
        const current = prev + randInt(rng, 80, 400);
        const steps = Array.from({ length: 4 }, () => randInt(rng, 80, 200));
        meters.push({
          id: meterId, propertyId: propId, unitId: uId,
          type: 'electricity', meterNumber,
          unitOfMeasure: 'kWh', previousReading: prev, currentReading: current,
          ratePerUnit: 68,
          history: readingHistory(prev, current, steps),
        });

        // Occupied units get a tenant + lease + invoices + payments
        if (status === 'occupied' || status === 'reserved') {
          buildTenancy(unit, property, cycle, {
            rng, users, tenants, leases, invoices, payments, phone, fullName, color,
            emailFor, techs, occupied: status === 'occupied',
          });
        }
      }
    }
  });

  // Water and gas meters. They draw from their own random stream, so adding them leaves every other seeded record exactly as it was.
  addWaterAndGasMeters(units, meters);

  // Recompute vendor totals from expenses later; first generate maintenance & expenses
  generateMaintenance({ rng, properties, units, leases, techs, vendors, maintenance, fullName });
  generateExpenses({ rng, properties, vendors, expenses, financeUser, admin });
  vendors.forEach((v) => {
    const vExp = expenses.filter((e) => e.vendorId === v.id);
    v.totalPaid = vExp.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
    v.outstanding = vExp.filter((e) => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  });

  generateInspections({ rng, properties, units, tenants, leases, techs, inspections });
  generateListingsAndLeads({ rng, properties, units, agents, listings, leads, fullName, phone, emailFor });
  generateDocuments({ rng, properties, units, tenants, leases, invoices, documents, admin });
  generateNotices({ notices, admin, properties });
  generateMessages({ messages, users, leases, properties, rng });
  generateNotifications({ notifications, payments, leases, maintenance, invoices });
  generateAudit({ audit, payments, users, admin });
  generateTasksAndEvents({ rng, tasks, events, leases, inspections, maintenance, invoices, managers });

  return {
    users, properties, buildings, units, tenants, leases, invoices, payments,
    maintenance, expenses, vendors, inspections, meters, listings, leads,
    documents, notifications, notices, messages, audit, tasks, events,
    maintenancePayouts: [], memberships: [], invitations: [],
    settings: null, integrations: {}, rbac: null, dashboard: null, portal: null,
  };
}

// ---- Tenancy builder (tenant + lease + invoices + payments) ----------------

interface TenancyCtx {
  rng: () => number;
  users: User[]; tenants: Tenant[]; leases: Lease[]; invoices: Invoice[]; payments: Payment[];
  phone: () => string; fullName: () => string; color: () => string;
  emailFor: (n: string, d?: string) => string; techs: User[]; occupied: boolean;
}

function buildTenancy(unit: Unit, property: Property, cycle: BillingCycle, ctx: TenancyCtx) {
  const { rng, users, tenants, leases, invoices, payments, phone, fullName, color, emailFor } = ctx;
  const name = fullName();
  const tId = seqId('ten');
  const ownerId = property.owners[0].ownerId;
  const tenant: Tenant = {
    id: tId, name, email: emailFor(name), phone: phone(),
    identityType: pick(rng, ['National ID (NIN)', "Driver's License", 'International Passport']),
    identityNumber: `${randInt(rng, 10000000000, 99999999999)}`,
    emergencyContactName: fullName(), emergencyContactPhone: phone(),
    guarantorName: rng() > 0.4 ? fullName() : undefined,
    guarantorPhone: rng() > 0.4 ? phone() : undefined,
    ownerId, avatarColor: color(), createdAt: addMonths(TODAY, -randInt(rng, 3, 30)),
  };
  tenants.push(tenant);

  // Make a subset of tenants able to log in (linked user accounts)
  if (tenants.length % 3 === 0) {
    users.push({
      id: `tuser_${tId}`, name, email: tenant.email, phone: tenant.phone,
      role: 'tenant', avatarColor: tenant.avatarColor, ownerId, tenantId: tId,
      twoFactorEnabled: false, status: 'active', lastLoginAt: addMonths(TODAY, 0),
    });
  }

  const cycleMonths = cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : cycle === 'half-yearly' ? 6 : 12;
  // A one-year lease that is still running: started within the last 11 months, so its unit really is let. (It used
  // to reach back 14 months, which left about one occupied unit in seven with a lease that had already ended.)
  const startMonthsAgo = randInt(rng, 1, 11);
  const startDate = addMonths(TODAY, -startMonthsAgo);
  const endDate = addMonths(startDate, 12);
  const until = daysUntil(endDate);
  const leaseStatus: LeaseStatus = until <= 60 ? 'expiring' : 'active';

  const leaseId = seqId('lease');
  // The deposit was collected in full when the lease began (a few tenants are still paying theirs in, below).
  const lease: Lease = {
    id: leaseId, code: `LSE-${leaseId.slice(-5).toUpperCase()}`,
    unitId: unit.id, propertyId: property.id, tenantId: tId,
    startDate, endDate, rent: unit.rent, billingCycle: cycle,
    securityDeposit: unit.securityDeposit, noticePeriodDays: 90,
    status: leaseStatus, signed: rng() > 0.2,
    createdAt: startDate,
    depositLedger: [{ id: seqId('dep'), type: 'received', amount: unit.securityDeposit, date: startDate, note: 'Deposit received by bank-transfer' }],
  };

  // A reserved unit is held for this prospective tenant but not let yet: they exist, a lease does not. (The lease is
  // still drawn above so the rest of the seed's random sequence is unchanged.) Nothing is billed until it is let.
  if (!ctx.occupied) return;
  leases.push(lease);

  // Current-period invoice
  // Rent and service charge are annual figures; an invoice carries the share of the year its period covers.
  const periodRent = periodShare(unit.rent, cycleMonths);
  const periodService = periodShare(unit.serviceCharge, cycleMonths);
  const total = periodRent + periodService + (rng() > 0.7 ? unit.utilityCharge : 0);
  const dueOffsetDays = randInt(rng, -40, 25);
  const dueDate = dayjs(TODAY).add(dueOffsetDays, 'day').format('YYYY-MM-DD');
  const issueDate = dayjs(dueDate).subtract(14, 'day').format('YYYY-MM-DD');
  const invId = seqId('inv');

  // Decide a payment scenario
  const scenario = rng();
  let amountPaid = 0;
  let status: InvoiceStatus = 'unpaid';
  const invoicePayments: Payment[] = [];

  const methods: PaymentMethod[] = ['bank-transfer', 'online', 'cash', 'pos'];

  const makePayment = (amount: number, pStatus: Payment['status'], daysAgo: number, isPending = false): Payment => {
    const pid = seqId('pay');
    const method = pick(rng, methods);
    const pDate = dayjs(TODAY).subtract(daysAgo, 'day').format('YYYY-MM-DD');
    return {
      id: pid, code: `PAY-${pid.slice(-5).toUpperCase()}`,
      invoiceId: invId, leaseId, unitId: unit.id, propertyId: property.id, tenantId: tId,
      type: 'rent', method, amount, paymentDate: pDate,
      bankName: method === 'bank-transfer' ? pick(rng, ['GTBank', 'Zenith Bank', 'Access Bank', 'UBA', 'First Bank']) : undefined,
      reference: `${method === 'online' ? 'TRX' : 'REF'}${randInt(rng, 100000, 999999)}`,
      payerName: name,
      description: `${cycle} rent payment for unit ${unit.code}`,
      receiptFileName: method !== 'online' ? `receipt-${unit.code}-${randInt(rng, 100, 999)}.jpg` : undefined,
      status: pStatus,
      submittedAt: `${pDate}T${randInt(rng, 8, 18)}:${randInt(rng, 10, 59)}:00`,
      reviewedById: pStatus === 'approved' ? 'finance_1' : pStatus === 'rejected' ? 'mgr_1' : undefined,
      reviewedAt: pStatus === 'approved' || pStatus === 'rejected' ? dayjs(pDate).add(1, 'day').format('YYYY-MM-DDT10:30:00') : undefined,
      rejectionReason: pStatus === 'rejected' ? pick(rng, ['Receipt amount does not match submitted amount.', 'Transaction reference could not be verified with the bank.', 'Uploaded receipt is illegible — please re-upload.']) : undefined,
      verificationNotes: pStatus === 'approved' ? 'Confirmed against bank statement.' : undefined,
    };
  };

  if (scenario < 0.45) {
    // Fully paid via 1-3 approved payments
    status = 'fully-paid'; amountPaid = total;
    const parts = randInt(rng, 1, 3);
    let remaining = total;
    for (let k = 0; k < parts; k++) {
      const amt = k === parts - 1 ? remaining : Math.round((total / parts) / 10000) * 10000;
      remaining -= amt;
      invoicePayments.push(makePayment(amt, 'approved', randInt(rng, 5, 60) + (parts - k) * 10));
    }
  } else if (scenario < 0.68) {
    // Partially paid (approved) + possibly a pending top-up
    const paid = Math.round((total * (0.3 + rng() * 0.4)) / 10000) * 10000;
    amountPaid = paid; status = 'partially-paid';
    invoicePayments.push(makePayment(paid, 'approved', randInt(rng, 10, 50)));
    if (rng() > 0.5) {
      invoicePayments.push(makePayment(total - paid, 'pending-verification', randInt(rng, 0, 4), true));
    }
  } else if (scenario < 0.82) {
    // Pending verification only (no approved yet) — feeds verification queue
    status = 'pending-verification';
    invoicePayments.push(makePayment(total, 'pending-verification', randInt(rng, 0, 3), true));
  } else if (scenario < 0.9) {
    // Rejected attempt, still unpaid
    status = dueOffsetDays < 0 ? 'overdue' : 'unpaid';
    invoicePayments.push(makePayment(total, 'rejected', randInt(rng, 2, 12)));
  } else {
    // Unpaid / overdue
    status = dueOffsetDays < 0 ? 'overdue' : 'unpaid';
  }

  // Recompute running balance on approved payments (ledger)
  let bal = total;
  invoicePayments
    .slice()
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
    .forEach((p) => {
      if (p.status === 'approved') {
        bal -= p.amount;
        p.balanceAfter = Math.max(0, bal);
      }
    });

  const invoice: Invoice = {
    id: invId, code: `INV-${invId.slice(-5).toUpperCase()}`,
    leaseId, unitId: unit.id, propertyId: property.id, tenantId: tId,
    issueDate, dueDate,
    lineItems: [
      { id: seqId('li'), description: `${cycle} rent — ${unit.type} ${unit.code}`, type: 'rent', amount: periodRent },
      { id: seqId('li'), description: 'Service charge', type: 'service-charge', amount: periodService },
      ...(total > periodRent + periodService ? [{ id: seqId('li'), description: 'Utility charge', type: 'utility' as const, amount: unit.utilityCharge }] : []),
    ],
    total, amountPaid, status, cycle,
  };
  // The organization's late-fee policy (see DEFAULTS in the backend's SettingsService): an invoice more than the grace
  // period past due that still owes money, with no payment waiting to be verified, is charged ONE fee of lateFeePercent
  // of what is owed. The fee is part of the total, as the server does it.
  const owing = total - amountPaid;
  const paymentInFlight = invoicePayments.some((p) => p.status === 'pending-verification' || p.status === 'initiated');
  if (status !== 'fully-paid' && owing > 0 && dueOffsetDays < -LATE_FEE_GRACE_DAYS && !paymentInFlight) {
    const fee = Math.round((owing * LATE_FEE_PERCENT) / 100);
    invoice.penalty = fee;
    invoice.total = total + fee;
    invoice.lateFeeAppliedOn = dayjs(dueDate).add(LATE_FEE_GRACE_DAYS + 1, 'day').format('YYYY-MM-DD');
  }
  invoices.push(invoice);
  payments.push(...invoicePayments);
}

// ---- Maintenance -----------------------------------------------------------

function generateMaintenance(a: {
  rng: () => number; properties: Property[]; units: Unit[]; leases: Lease[];
  techs: User[]; vendors: Vendor[]; maintenance: MaintenanceRequest[]; fullName: () => string;
}) {
  const { rng, units, leases, techs, vendors, maintenance } = a;
  const occupied = units.filter((u) => u.status === 'occupied' || u.status === 'maintenance');
  const count = Math.min(38, Math.floor(occupied.length * 0.35));
  const statuses: MaintenanceRequest['status'][] = ['open', 'assigned', 'in-progress', 'completed', 'verified', 'closed'];
  for (let i = 0; i < count; i++) {
    const unit = pick(rng, occupied);
    const lease = leases.find((l) => l.unitId === unit.id && l.status !== 'terminated');
    const category = pick(rng, MAINT_CATEGORIES);
    const title = pick(rng, MAINT_TITLES[category] ?? ['General repair']);
    const status = pick(rng, statuses);
    const done = ['completed', 'verified', 'closed'].includes(status);
    const started = ['in-progress', 'completed', 'verified', 'closed'].includes(status);
    const verified = ['verified', 'closed'].includes(status);
    const createdAt = dayjs(TODAY).subtract(randInt(rng, 1, 90), 'day').format('YYYY-MM-DD');
    const mid = seqId('mnt');
    const spec = `${title}: use ${pick(rng, ['OEM', 'grade-A', 'manufacturer-approved', 'standard'])} parts, ${pick(rng, ['2-year', '1-year', '18-month'])} warranty.`;
    // Inspection rounds accumulate as the job moves through triage → progress → post-repair.
    const rounds: MaintenanceRound[] = [];
    if (status !== 'open') rounds.push({ id: seqId('rnd'), stage: 'triage', date: createdAt, byId: pick(rng, techs).id, outcome: 'issues', findings: 'Issue confirmed on site; severity assessed and work authorised.' });
    if (started) rounds.push({ id: seqId('rnd'), stage: 'progress', date: dayjs(createdAt).add(randInt(rng, 1, 4), 'day').format('YYYY-MM-DD'), byId: pick(rng, techs).id, outcome: 'ok', findings: 'Repair underway; costs and workmanship on track.' });
    if (verified) rounds.push({ id: seqId('rnd'), stage: 'final', date: dayjs(createdAt).add(randInt(rng, 5, 12), 'day').format('YYYY-MM-DD'), byId: 'mgr_1', outcome: 'ok', findings: 'Work completed to standard; materials match specification.' });
    maintenance.push({
      id: mid, code: `MNT-${mid.slice(-5).toUpperCase()}`,
      propertyId: unit.propertyId, unitId: unit.id, tenantId: lease?.tenantId,
      title, category, description: `${title}. Reported by occupant; requires attention.`,
      urgency: pick(rng, ['low', 'medium', 'high', 'emergency']),
      status,
      createdAt,
      assignedToId: status !== 'open' ? pick(rng, techs).id : undefined,
      vendorId: status !== 'open' && rng() > 0.6 ? pick(rng, vendors).id : undefined,
      materialsCost: done ? randInt(rng, 5, 120) * 1000 : 0,
      labourCost: done ? randInt(rng, 5, 60) * 1000 : 0,
      specifiedMaterials: status !== 'open' ? spec : undefined,
      actualMaterials: done ? spec.replace(/^[^:]+: /, '') : undefined,
      materialsMatch: verified ? true : undefined,
      rounds,
      photos: ['#94a3b8', '#cbd5e1'].slice(0, randInt(rng, 1, 2)),
      afterPhotos: done ? ['#34d399'] : [],
      completedAt: done ? dayjs(createdAt).add(randInt(rng, 1, 10), 'day').format('YYYY-MM-DD') : undefined,
      verifiedById: verified ? 'mgr_1' : undefined,
      closedAt: status === 'closed' ? dayjs(createdAt).add(randInt(rng, 3, 14), 'day').format('YYYY-MM-DD') : undefined,
    });
  }
}

// ---- Expenses --------------------------------------------------------------

function generateExpenses(a: {
  rng: () => number; properties: Property[]; vendors: Vendor[]; expenses: Expense[];
  financeUser: User; admin: User;
}) {
  const { rng, properties, vendors, expenses } = a;
  const cats: Expense['category'][] = ['repairs', 'security', 'cleaning', 'utilities', 'fuel', 'insurance', 'tax', 'staff', 'management-fee', 'other'];
  properties.forEach((p) => {
    const n = randInt(rng, 4, 9);
    for (let i = 0; i < n; i++) {
      const category = pick(rng, cats);
      const status = pick(rng, ['pending', 'approved', 'paid', 'paid', 'paid'] as Expense['status'][]);
      const eid = seqId('exp');
      const base = category === 'staff' ? randInt(rng, 150, 600) : category === 'security' ? randInt(rng, 200, 500) : category === 'fuel' ? randInt(rng, 80, 300) : randInt(rng, 20, 250);
      expenses.push({
        id: eid, code: `EXP-${eid.slice(-5).toUpperCase()}`,
        propertyId: p.id, category,
        vendorId: ['repairs', 'cleaning', 'security'].includes(category) ? pick(rng, vendors).id : undefined,
        description: `${category[0].toUpperCase() + category.slice(1)} — ${p.name}`,
        amount: base * 1000, date: dayjs(TODAY).subtract(randInt(rng, 1, 120), 'day').format('YYYY-MM-DD'),
        status, receiptFileName: rng() > 0.3 ? `expense-${eid.slice(-4)}.pdf` : undefined,
        approvedById: status !== 'pending' ? 'finance_1' : undefined,
      });
    }
  });
}

// ---- Inspections -----------------------------------------------------------

function generateInspections(a: {
  rng: () => number; properties: Property[]; units: Unit[]; tenants: Tenant[];
  leases: Lease[]; techs: User[]; inspections: Inspection[];
}) {
  const { rng, units, leases, techs, inspections } = a;
  const types: Inspection['type'][] = ['move-in', 'routine', 'maintenance', 'move-out'];
  const areas = ['Living Room', 'Kitchen', 'Bathroom', 'Bedrooms', 'Walls & Ceiling', 'Flooring', 'Electrical', 'Plumbing', 'Windows & Doors'];
  const occupiedLeases = leases.filter((l) => l.status !== 'terminated');
  for (let i = 0; i < 22; i++) {
    const lease = pick(rng, occupiedLeases);
    const unit = units.find((u) => u.id === lease.unitId)!;
    const type = pick(rng, types);
    const scheduled = dayjs(TODAY).add(randInt(rng, -40, 30), 'day').format('YYYY-MM-DD');
    const isPast = daysUntil(scheduled) < 0;
    const status: Inspection['status'] = isPast ? (rng() > 0.15 ? 'completed' : 'cancelled') : 'scheduled';
    const iid = seqId('insp');
    inspections.push({
      id: iid, code: `INS-${iid.slice(-5).toUpperCase()}`,
      propertyId: unit.propertyId, unitId: unit.id, tenantId: lease.tenantId,
      type, status, scheduledDate: scheduled,
      completedDate: status === 'completed' ? scheduled : undefined,
      inspectorId: pick(rng, techs).id,
      items: shuffle(rng, areas).slice(0, randInt(rng, 4, 7)).map((area) => ({
        area, condition: pick(rng, ['good', 'good', 'fair', 'poor', 'damaged'] as const),
        notes: rng() > 0.7 ? 'Minor wear noted.' : undefined,
      })),
      depositDeductions: type === 'move-out' && status === 'completed' ? randInt(rng, 0, 200) * 1000 : undefined,
    });
  }
}

// ---- Listings & leads ------------------------------------------------------

function generateListingsAndLeads(a: {
  rng: () => number; properties: Property[]; units: Unit[]; agents: User[];
  listings: Listing[]; leads: Lead[]; fullName: () => string; phone: () => string;
  emailFor: (n: string, d?: string) => string;
}) {
  const { rng, units, agents, listings, leads, fullName, phone, emailFor } = a;
  const vacant = units.filter((u) => u.status === 'available' || u.status === 'reserved');
  vacant.forEach((u) => {
    const lid = seqId('lst');
    listings.push({
      id: lid, propertyId: u.propertyId, unitId: u.id,
      title: `${u.type} for Lease — Unit ${u.code}`,
      price: u.rent, status: u.status === 'reserved' ? 'let' : 'published',
      publishedAt: dayjs(TODAY).subtract(randInt(rng, 2, 60), 'day').format('YYYY-MM-DD'),
      description: `Spacious ${u.type.toLowerCase()} available for lease. ${u.bedrooms} bed, ${u.bathrooms} bath, ${u.sizeSqm}sqm.`,
      agentId: pick(rng, agents).id,
    });
  });
  const leadStatuses: Lead['status'][] = ['new', 'contacted', 'viewing-scheduled', 'negotiating', 'converted', 'lost'];
  for (let i = 0; i < 26; i++) {
    const listing = pick(rng, listings);
    const name = fullName();
    const status = pick(rng, leadStatuses);
    const lid = seqId('lead');
    leads.push({
      id: lid, name, email: emailFor(name), phone: phone(),
      listingId: listing?.id, propertyId: listing?.propertyId, status,
      agentId: listing?.agentId ?? pick(rng, agents).id,
      createdAt: dayjs(TODAY).subtract(randInt(rng, 1, 45), 'day').format('YYYY-MM-DD'),
      viewingDate: ['viewing-scheduled', 'negotiating', 'converted'].includes(status)
        ? dayjs(TODAY).add(randInt(rng, -10, 14), 'day').format('YYYY-MM-DD') : undefined,
    });
  }
}

// ---- Documents -------------------------------------------------------------

function generateDocuments(a: {
  rng: () => number; properties: Property[]; units: Unit[]; tenants: Tenant[];
  leases: Lease[]; invoices: Invoice[]; documents: DocumentRecord[]; admin: User;
}) {
  const { rng, properties, tenants, leases, documents, admin } = a;
  properties.forEach((p) => {
    (['deed', 'insurance', 'tax'] as const).forEach((category) => {
      const d = seqId('doc');
      documents.push({
        id: d, name: `${p.name} — ${category.toUpperCase()} document`, category,
        propertyId: p.id, fileType: 'pdf', sizeKb: randInt(rng, 200, 3200),
        uploadedAt: dayjs(TODAY).subtract(randInt(rng, 30, 400), 'day').format('YYYY-MM-DD'),
        uploadedById: admin.id,
      });
    });
  });
  leases.slice(0, 40).forEach((l) => {
    const t = tenants.find((tt) => tt.id === l.tenantId);
    const d = seqId('doc');
    documents.push({
      id: d, name: `Lease Agreement — ${l.code}`, category: 'lease-agreement',
      propertyId: l.propertyId, unitId: l.unitId, tenantId: l.tenantId,
      fileType: 'pdf', sizeKb: randInt(rng, 120, 800),
      uploadedAt: l.createdAt, uploadedById: admin.id,
    });
    if (t) {
      const d2 = seqId('doc');
      documents.push({
        id: d2, name: `${t.name} — ID (${t.identityType})`, category: 'tenant-id',
        propertyId: l.propertyId, unitId: l.unitId, tenantId: t.id,
        fileType: 'jpg', sizeKb: randInt(rng, 80, 400), uploadedAt: t.createdAt, uploadedById: admin.id,
      });
    }
  });
}

// ---- Notices, notifications, audit, tasks ----------------------------------

function generateNotices(a: { notices: Notice[]; admin: User; properties: Property[] }) {
  const { notices, admin, properties } = a;
  const items: Omit<Notice, 'id' | 'createdById'>[] = [
    { title: 'Scheduled water tank cleaning', body: 'Water supply will be interrupted on Saturday 09:00–13:00 for tank maintenance across all blocks.', audience: 'tenants', createdAt: '2026-08-20', propertyId: properties[0]?.id },
    { title: 'Q3 service charge reminder', body: 'Kindly settle outstanding service charges before month end to avoid penalties.', audience: 'tenants', createdAt: '2026-08-18' },
    { title: 'New payment verification policy', body: 'All manual/bank-transfer payments now require a clear receipt upload for faster verification.', audience: 'all', createdAt: '2026-08-15' },
    { title: 'Owner statements available', body: 'August owner statements are now available for download in the Reports section.', audience: 'owners', createdAt: '2026-08-12' },
  ];
  items.forEach((n) => notices.push({ ...n, id: seqId('notice'), createdById: admin.id }));
}

function generateMessages(a: { messages: Message[]; users: User[]; leases: Lease[]; properties: Property[]; rng: () => number }) {
  const { messages, users, leases, properties } = a;
  const TENANT_LINES = [
    'Hello, the kitchen tap has started leaking again — could someone take a look this week?',
    'Good morning. I’ve made this month’s rent payment and uploaded the receipt for verification.',
    'Thank you for the quick turnaround on the AC repair, it’s working perfectly now.',
    'Please could you confirm the date for the routine inspection?',
    'The estate gate access card has stopped working. Who should I speak to?',
    'Is it possible to renew my lease for another 12 months on the current terms?',
  ];
  const MANAGER_LINES = [
    'Thanks for letting us know — I’ve logged a maintenance request and a technician will be assigned shortly.',
    'Received, thank you. Finance will verify the payment and issue your receipt within 24 hours.',
    'Glad to hear it! Do reach out if anything else comes up.',
    'The inspection is booked for next week; I’ll confirm the exact time by email.',
    'I’ll arrange a replacement access card at the estate office today.',
    'Happy to renew — I’ll send across the renewal paperwork for your review.',
  ];
  const FINANCE_LINES = [
    'Your payment has been verified and the receipt is now available under Documents.',
    'We’re unable to match this transfer yet — could you re-upload a clearer copy of the receipt?',
  ];
  const dt = (daysAgo: number, hour: number) => dayjs(TODAY).subtract(daysAgo, 'day').hour(hour).minute(20).format('YYYY-MM-DDTHH:mm:00');

  const tenantUsers = users.filter((u) => u.role === 'tenant' && u.tenantId);
  // Manager ↔ tenant threads (pattern controls length + trailing unread)
  const PATTERNS: boolean[][] = [[true, false, true], [true, false], [true, false, true, false]];
  tenantUsers.forEach((tu, idx) => {
    const lease = leases.find((l) => l.tenantId === tu.tenantId);
    const mgrId = lease ? properties.find((p) => p.id === lease.propertyId)?.managerId : undefined;
    if (!mgrId) return;
    const threadId = `thr_${[tu.id, mgrId].sort().join('_')}`;
    const pattern = PATTERNS[idx % PATTERNS.length];
    pattern.forEach((fromTenant, i) => {
      const isLast = i === pattern.length - 1;
      messages.push({
        id: seqId('msg'), threadId,
        fromUserId: fromTenant ? tu.id : mgrId,
        toUserId: fromTenant ? mgrId : tu.id,
        body: fromTenant ? TENANT_LINES[(idx + i) % TENANT_LINES.length] : MANAGER_LINES[(idx + i) % MANAGER_LINES.length],
        createdAt: dt(pattern.length - i + (idx % 4), 9 + i),
        read: fromTenant ? !isLast : true,
      });
    });
  });

  // Finance ↔ tenant payment queries (gives the finance login content)
  tenantUsers.slice(0, 3).forEach((tu, i) => {
    const threadId = `thr_${['finance_1', tu.id].sort().join('_')}`;
    messages.push({ id: seqId('msg'), threadId, fromUserId: tu.id, toUserId: 'finance_1', body: 'Hi, can you confirm you received my rent transfer for this month?', createdAt: dt(3 + i, 10), read: i !== 0 });
    messages.push({ id: seqId('msg'), threadId, fromUserId: 'finance_1', toUserId: tu.id, body: FINANCE_LINES[i % FINANCE_LINES.length], createdAt: dt(3 + i, 14), read: true });
  });

  // Admin ↔ manager operational thread
  const mgr = users.find((u) => u.role === 'manager');
  if (mgr) {
    const threadId = `thr_${['admin_1', mgr.id].sort().join('_')}`;
    messages.push({ id: seqId('msg'), threadId, fromUserId: 'admin_1', toUserId: mgr.id, body: 'Please prioritise the emergency maintenance backlog this week and update statuses daily.', createdAt: dt(2, 8), read: true });
    messages.push({ id: seqId('msg'), threadId, fromUserId: mgr.id, toUserId: 'admin_1', body: 'Understood — two technicians are on it, I’ll keep the board current.', createdAt: dt(2, 11), read: false });
  }
}

function generateNotifications(a: {
  notifications: AppNotification[]; payments: Payment[]; leases: Lease[];
  maintenance: MaintenanceRequest[]; invoices: Invoice[];
}) {
  const { notifications, payments, leases, maintenance, invoices } = a;
  const pending = payments.filter((p) => p.status === 'pending-verification');
  pending.slice(0, 7).forEach((p) => {
    notifications.push({
      id: seqId('ntf'), kind: 'payment',
      title: 'Payment awaiting verification',
      body: `Payment ${p.code} of ₦${p.amount.toLocaleString('en-NG')} submitted for review.`,
      createdAt: p.submittedAt, read: false, forRole: 'finance', link: '/payments/verification',
    });
  });

  // ---- Automatic rent reminders to tenants (due-soon + overdue) -------------
  const outstandingInvoices = invoices.filter(
    (inv) => ['unpaid', 'overdue', 'partially-paid'].includes(inv.status) && inv.total - inv.amountPaid > 0,
  );
  outstandingInvoices.slice(0, 14).forEach((inv) => {
    const outstanding = inv.total - inv.amountPaid;
    const days = daysUntil(inv.dueDate);
    const overdue = days < 0;
    if (!overdue && days > 14) return; // only remind within a two-week window
    notifications.push({
      id: seqId('ntf'), kind: 'rent',
      title: overdue ? 'Rent overdue' : 'Rent due soon',
      body: overdue
        ? `Invoice ${inv.code} for ₦${outstanding.toLocaleString('en-NG')} was due on ${dayjs(inv.dueDate).format('DD MMM YYYY')} (${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago). Please settle it to avoid penalties.`
        : `Invoice ${inv.code} for ₦${outstanding.toLocaleString('en-NG')} is due on ${dayjs(inv.dueDate).format('DD MMM YYYY')}${days === 0 ? ' — today' : ` (in ${days} day${days === 1 ? '' : 's'})`}.`,
      createdAt: TODAY, read: false, forUserId: inv.tenantId, link: '/portal/payments',
    });
  });
  // Manager digest so owners/managers stay updated on collections.
  const overdueCount = outstandingInvoices.filter((inv) => daysUntil(inv.dueDate) < 0).length;
  if (overdueCount > 0) {
    notifications.push({
      id: seqId('ntf'), kind: 'rent', title: 'Overdue rent needs follow-up',
      body: `${overdueCount} invoice${overdueCount === 1 ? '' : 's'} across the portfolio ${overdueCount === 1 ? 'is' : 'are'} past due. Reminders have been sent to tenants.`,
      createdAt: TODAY, read: false, forRole: 'manager', link: '/invoices',
    });
  }

  leases.filter((l) => l.status === 'expiring').slice(0, 5).forEach((l) => {
    notifications.push({
      id: seqId('ntf'), kind: 'lease', title: 'Lease expiring soon',
      body: `Lease ${l.code} expires on ${dayjs(l.endDate).format('DD MMM YYYY')}.`,
      createdAt: TODAY, read: false, forRole: 'owner', link: '/leases',
    });
    // Remind the tenant directly as well.
    notifications.push({
      id: seqId('ntf'), kind: 'lease', title: 'Your lease is expiring soon',
      body: `Your lease ${l.code} expires on ${dayjs(l.endDate).format('DD MMM YYYY')}. Contact management to discuss renewal.`,
      createdAt: TODAY, read: false, forUserId: l.tenantId, link: '/portal',
    });
  });
  maintenance.filter((m) => m.urgency === 'emergency' && m.status !== 'closed').slice(0, 3).forEach((m) => {
    notifications.push({
      id: seqId('ntf'), kind: 'maintenance', title: 'Emergency maintenance request',
      body: `${m.title} (${m.code}) flagged as emergency.`,
      createdAt: m.createdAt, read: false, forRole: 'manager', link: '/maintenance',
    });
  });
  notifications.push({
    id: seqId('ntf'), kind: 'announcement', title: 'Welcome to your PMS portal',
    body: 'Explore your portfolio, verify payments and generate reports.',
    createdAt: '2026-08-25', read: true,
  });
}

function generateAudit(a: { audit: AuditLog[]; payments: Payment[]; users: User[]; admin: User }) {
  const { audit, payments, admin } = a;
  const devices = ['Chrome / macOS', 'Safari / iOS', 'Edge / Windows', 'Chrome / Android'];
  const ips = ['102.89.34.12', '197.210.44.9', '105.112.7.201', '160.152.10.7'];
  let counter = 0;
  const push = (o: Omit<AuditLog, 'id'>) => audit.push({ ...o, id: seqId('aud') });
  payments.filter((p) => p.status === 'approved').slice(0, 20).forEach((p) => {
    push({ action: 'payment-approve', entity: 'Payment', entityId: p.id, userId: p.reviewedById ?? 'finance_1', summary: `Approved ${p.code} (₦${p.amount.toLocaleString('en-NG')})`, timestamp: p.reviewedAt ?? p.submittedAt, ip: ips[counter++ % ips.length], device: devices[counter % devices.length] });
  });
  payments.filter((p) => p.status === 'rejected').slice(0, 8).forEach((p) => {
    push({ action: 'payment-reject', entity: 'Payment', entityId: p.id, userId: p.reviewedById ?? 'mgr_1', summary: `Rejected ${p.code}: ${p.rejectionReason ?? ''}`, timestamp: p.reviewedAt ?? p.submittedAt, ip: ips[counter++ % ips.length], device: devices[counter % devices.length] });
  });
  payments.filter((p) => p.status === 'pending-verification').slice(0, 10).forEach((p) => {
    push({ action: 'payment-submit', entity: 'Payment', entityId: p.id, userId: `tenant`, summary: `Submitted ${p.code} for verification`, timestamp: p.submittedAt, ip: ips[counter++ % ips.length], device: devices[counter % devices.length] });
  });
  ['login', 'export', 'edit', 'create', 'permission-change', 'document-access'].forEach((act, i) => {
    push({ action: act as AuditLog['action'], entity: 'System', userId: admin.id, summary: `${act.replace('-', ' ')} action performed by ${admin.name}`, timestamp: dayjs(TODAY).subtract(i, 'day').format('YYYY-MM-DDT09:00:00'), ip: ips[i % ips.length], device: devices[i % devices.length] });
  });
  audit.sort((x, y) => y.timestamp.localeCompare(x.timestamp));
}

function generateTasksAndEvents(a: {
  rng: () => number; tasks: TaskItem[]; events: CalendarEvent[]; leases: Lease[];
  inspections: Inspection[]; maintenance: MaintenanceRequest[]; invoices: Invoice[]; managers: User[];
}) {
  const { rng, tasks, events, leases, inspections, maintenance, invoices, managers } = a;
  const taskTitles = ['Follow up overdue rent', 'Renew expiring lease', 'Schedule quarterly inspection', 'Approve pending expenses', 'Confirm vendor invoice', 'Review maintenance backlog', 'Send rent reminders', 'Update insurance policy'];
  taskTitles.forEach((title, i) => {
    tasks.push({
      id: seqId('task'), title,
      dueDate: dayjs(TODAY).add(randInt(rng, -3, 14), 'day').format('YYYY-MM-DD'),
      done: rng() > 0.6, assignedToId: pick(rng, managers).id,
      priority: pick(rng, ['low', 'medium', 'high']),
    });
  });
  inspections.filter((i) => i.status === 'scheduled').slice(0, 8).forEach((i) => {
    events.push({ id: seqId('evt'), title: `${i.type} inspection`, date: i.scheduledDate, kind: 'inspection', refId: i.id });
  });
  leases.filter((l) => l.status === 'expiring').slice(0, 8).forEach((l) => {
    events.push({ id: seqId('evt'), title: `Lease ${l.code} expires`, date: l.endDate, kind: 'lease', refId: l.id });
  });
  invoices.filter((inv) => inv.status === 'unpaid' || inv.status === 'overdue').slice(0, 8).forEach((inv) => {
    events.push({ id: seqId('evt'), title: `Invoice ${inv.code} due`, date: inv.dueDate, kind: 'payment', refId: inv.id });
  });
  maintenance.filter((m) => m.status !== 'closed').slice(0, 6).forEach((m) => {
    events.push({ id: seqId('evt'), title: m.title, date: m.createdAt, kind: 'maintenance', refId: m.id });
  });
}

/**
 * Most lettable units have a water meter and some a gas meter, alongside the electricity one every unit has. They differ in
 * unit and tariff, and some have already been billed up to an earlier reading, so billing the demo exercises every case:
 * a never-billed meter, a part-billed one, and one with nothing new to bill.
 */
function addWaterAndGasMeters(units: Unit[], meters: Meter[]) {
  const rng = createRng(20260826);
  for (const unit of units) {
    if (unit.status === 'renovation' || unit.status === 'maintenance') continue;

    const add = (type: 'water' | 'gas', code: string, unitOfMeasure: string, ratePerUnit: number, start: number, perMonth: [number, number]) => {
      const id = `mtr_${code}_${unit.id}`;
      const previousReading = start;
      const monthly = () => randInt(rng, perMonth[0], perMonth[1]);
      const steps = Array.from({ length: 4 }, monthly);
      const meterNumber = `${code.toUpperCase()}-${randInt(rng, 100000, 999999)}`;
      const currentReading = previousReading + monthly();
      const meter: Meter = {
        id, propertyId: unit.propertyId, unitId: unit.id, type, meterNumber,
        unitOfMeasure, previousReading, currentReading, ratePerUnit, history: readingHistory(previousReading, currentReading, steps),
      };
      // About a third were billed up to last month's reading; one in ten is fully billed, with nothing new to charge.
      const billed = rng();
      if (billed < 0.1) { meter.billedReading = meter.currentReading; meter.billedAt = TODAY; }
      else if (billed < 0.4) { meter.billedReading = previousReading; meter.billedAt = addMonths(TODAY, -1); }
      meters.push(meter);
      unit.meterIds = [...(unit.meterIds ?? []), id];
    };

    if (rng() < 0.85) add('water', 'wtr', 'm³', 350, randInt(rng, 200, 900), [8, 24]);
    if (unit.bedrooms >= 2 && rng() < 0.4) add('gas', 'gas', 'kg', 1250, randInt(rng, 40, 160), [6, 18]);
  }
}

/**
 * A meter's reading history the way real readings leave it: dated readings in order, running up to the reading before the
 * latest (`previous`, a month ago) and ending with the latest (`current`, today). `steps` are the use in each earlier month,
 * newest first from the end; the first is not needed to place the three earlier readings but is part of the seed's draw order.
 */
function readingHistory(previous: number, current: number, steps: number[]) {
  const m2 = previous - steps[3];
  const m3 = m2 - steps[2];
  const m4 = m3 - steps[1];
  return [
    { date: addMonths(TODAY, -4), value: Math.max(0, m4) },
    { date: addMonths(TODAY, -3), value: Math.max(0, m3) },
    { date: addMonths(TODAY, -2), value: Math.max(0, m2) },
    { date: addMonths(TODAY, -1), value: previous },
    { date: TODAY, value: current },
  ];
}
