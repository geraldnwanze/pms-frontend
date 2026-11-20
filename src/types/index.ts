// ============================================================================
// Domain model for the Property Management System
// Mirrors the entity hierarchy in the spec:
// Portfolio → Property → Building → Unit → Tenant → Lease → Invoice → Payment → Receipt
// ============================================================================

// ---- Users, roles & permissions -------------------------------------------

export type Role =
  | 'admin' // Super Administrator
  | 'owner' // Property Owner / Landlord
  | 'manager' // Property Manager
  | 'agent' // Real Estate Agent
  | 'tenant' // Tenant / Occupant
  | 'maintenance' // Maintenance Staff / Technician
  | 'finance' // Accountant / Finance Officer
  | 'user'; // Registered, not yet attached to any property

/** A role a person can hold *on a specific property*. */
export type MemberRole = Exclude<Role, 'admin' | 'user'>;

export type MembershipStatus = 'invited' | 'active' | 'declined' | 'revoked';

/** A person's relationship to one property (see backend property_members). */
export interface PropertyMember {
  id: string;
  propertyId: string;
  propertyName?: string;
  userId: string | null;
  email: string;
  role: MemberRole;
  status: MembershipStatus;
  tenantId?: string | null;
  invitedById?: string | null;
  invitedByName?: string | null;
  invitedAt?: string;
  respondedAt?: string | null;
  /** Payout bank details, set by the member on this membership (staff roles only). */
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankCode?: string | null;
  hasBankDetails?: boolean;
}

export type Permission =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'export'
  | 'manage_payments'
  | 'manage_users'
  | 'manage_documents'
  | 'manage_financials';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  avatarColor: string;
  title?: string;
  /** Owner this user belongs to (owners + their managers/agents/tenants scope) */
  ownerId?: string;
  /** For managers/agents: the properties they are assigned to. Empty = all (admin). */
  assignedPropertyIds?: string[];
  /** For tenants: their tenant record */
  tenantId?: string;
  twoFactorEnabled: boolean;
  /** Whether the account has proven it controls its email address. Invitations are hidden until it has. */
  emailVerified?: boolean;
  lastLoginAt?: string;
  status: 'active' | 'inactive' | 'invited';
}

// ---- Property hierarchy ----------------------------------------------------

export type PropertyType =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'mixed-use'
  | 'estate';

export type PropertyStatus =
  | 'active'
  | 'inactive'
  | 'construction'
  | 'renovation'
  | 'sold'
  | 'archived';

export interface OwnershipStake {
  ownerId: string;
  percentage: number;
}

export interface Property {
  id: string;
  code: string; // unique property reference
  name: string;
  type: PropertyType;
  status: PropertyStatus;
  owners: OwnershipStake[];
  managerId?: string;
  assignedStaffIds: string[];
  address: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
  description: string;
  landSizeSqm: number;
  builtUpAreaSqm: number;
  yearBuilt: number;
  renovationHistory?: string;
  amenities: string[];
  photos: string[]; // uploaded image URLs (`/storage/...`) and/or `#rrggbb` placeholder colour hints
  acquisitionDate?: string;
  acquisitionValue?: number;
  estimatedValue?: number;
  insuranceProvider?: string;
  insuranceExpiry?: string;
  taxReference?: string;
  createdAt: string;
}

export type UnitStatus =
  | 'available'
  | 'occupied'
  | 'reserved'
  | 'maintenance'
  | 'renovation'
  | 'unavailable';

export interface Building {
  id: string;
  propertyId: string;
  name: string;
  code: string;
  /** Structural style of the block — see BUILDING_TYPES in @/config/buildings. */
  buildingType?: string;
  floors: number;
  description?: string;
  /** Interior photos: uploaded image URLs (`/storage/...`). */
  photos?: string[] | null;
}

export type FurnishingLevel = 'unfurnished' | 'semi-furnished' | 'furnished';

export interface Unit {
  id: string;
  buildingId: string;
  propertyId: string;
  code: string; // unit number/code
  type: string; // e.g. "2-Bedroom Apartment", "Retail Shop"
  floor: number;
  sizeSqm: number;
  bedrooms: number;
  bathrooms: number;
  furnishing: FurnishingLevel;
  parkingSpaces: number;
  status: UnitStatus;
  // Recurring charges (monthly base figures)
  rent: number;
  serviceCharge: number;
  securityDeposit: number;
  utilityCharge: number;
  otherCharges: number;
  meterIds: string[];
  /** Unit photos: uploaded image URLs (`/storage/...`). */
  photos?: string[] | null;
}

// ---- Tenants & leases ------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  identityType: string;
  identityNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  guarantorName?: string;
  guarantorPhone?: string;
  ownerId: string; // which owner's portfolio this tenant belongs to
  avatarColor: string;
  createdAt: string;
}

export type BillingCycle =
  | 'monthly'
  | 'quarterly'
  | 'half-yearly'
  | 'annual'
  | 'custom';

export type LeaseStatus =
  | 'active'
  | 'expiring' // active but ends within 60 days
  | 'renewed'
  | 'terminated'
  | 'expired';

export interface Lease {
  id: string;
  code: string;
  unitId: string;
  propertyId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  rent: number;
  billingCycle: BillingCycle;
  securityDeposit: number;
  noticePeriodDays: number;
  status: LeaseStatus;
  /** The day the lease was terminated (its endDate stays the contract's). */
  terminatedOn?: string | null;
  signed: boolean;
  createdAt: string;
  notes?: string;
  /** Security-deposit ledger — what was received, kept and refunded. Written only by the deposit actions. */
  depositLedger?: DepositEntry[] | null;
  depositSettledOn?: string | null;
}

export type DepositEntryType = 'received' | 'deduction' | 'offset' | 'refund';

export interface DepositEntry {
  id: string;
  type: DepositEntryType;
  amount: number;
  date: string;
  note: string;
  byId?: string;
}

// ---- Invoices, payments, receipts ------------------------------------------

export type PaymentType =
  | 'rent'
  | 'partial-rent'
  | 'security-deposit'
  | 'service-charge'
  | 'utility'
  | 'maintenance'
  | 'application-fee'
  | 'other';

export type InvoiceStatus =
  | 'unpaid'
  | 'pending-verification'
  | 'partially-paid'
  | 'fully-paid'
  | 'overdue'
  | 'cancelled';

export interface InvoiceLineItem {
  id: string;
  description: string;
  type: PaymentType;
  amount: number;
  /** Utility lines only: the meter and the reading range that were billed. */
  meterId?: string;
  fromReading?: number;
  toReading?: number;
  units?: number;
  rate?: number;
}

/** What "bill all ready meters" raised, or (dry run) would raise: one entry per unit that has a tenant to bill. */
export interface BulkBillUnit {
  unitId: string;
  unitCode: string | null;
  propertyId: string;
  propertyName: string | null;
  /** A tenancy that has ended: this is the leaving tenant's last bill. */
  final: boolean;
  tenantId: string | null;
  tenantName: string | null;
  leaseCode: string | null;
  invoiceId: string | null;
  invoiceCode: string | null;
  total: number;
  meters: { meterId: string; meterNumber: string | null; type: MeterType | null; unitOfMeasure: string | null; from: number; to: number; units: number; rate: number; amount: number }[];
}

export interface BulkBillResult {
  dryRun: boolean;
  invoices: number;
  meters: number;
  total: number;
  units: BulkBillUnit[];
  skipped: { unitId: string; unitCode: string | null; propertyId: string; propertyName: string | null; reason: string }[];
}

/** One property's share of an earlier "bill all ready meters" run. */
export interface BulkBillRun {
  id: string;
  propertyId: string;
  propertyName: string | null;
  userId: string;
  userName: string | null;
  invoices: number;
  total: number;
  unitsSkipped: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  code: string;
  leaseId: string;
  unitId: string;
  propertyId: string;
  tenantId: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  total: number;
  amountPaid: number; // sum of approved payments
  status: InvoiceStatus;
  cycle: BillingCycle;
  penalty?: number; // late fee, charged by the server once after the grace period
  discount?: number;
  lateFeeAppliedOn?: string | null;
  lateFeeWaivedOn?: string | null;
}

export type PaymentMethod =
  | 'online'
  | 'bank-transfer'
  | 'cash'
  | 'pos'
  | 'cheque';

export type PaymentStatus =
  | 'initiated' // online checkout started, not yet paid
  | 'pending-verification'
  | 'approved'
  | 'rejected'
  | 'failed' // gateway reported failure / abandonment
  | 'refunded'
  | 'cancelled';

export interface Payment {
  id: string;
  code: string;
  invoiceId: string;
  leaseId: string;
  unitId: string;
  propertyId: string;
  tenantId: string;
  type: PaymentType;
  method: PaymentMethod;
  amount: number;
  paymentDate: string;
  bankName?: string;
  reference: string;
  payerName?: string;
  description?: string;
  receiptFileName?: string; // uploaded proof of payment (original name)
  receiptPath?: string; // stored file, fetched via /payments/{id}/receipt-link
  supportingFileName?: string;
  status: PaymentStatus;
  // Verification trail
  submittedAt: string;
  reviewedById?: string;
  reviewedAt?: string;
  verificationNotes?: string;
  rejectionReason?: string;
  balanceAfter?: number; // balance on the invoice after this payment (if approved)
  // Online-payment gateway trail (Paystack)
  gateway?: string;
  gatewayReference?: string;
  gatewayStatus?: string;
  channel?: string;
  feesAmount?: number;
  paidAt?: string;
}

// ---- Maintenance -----------------------------------------------------------

export type MaintenanceUrgency = 'low' | 'medium' | 'high' | 'emergency';
export type MaintenanceStatus =
  | 'open'
  | 'assigned'
  | 'in-progress'
  | 'completed'
  | 'tenant-confirmed' // tenant confirmed the work was done — gate for verify + payout
  | 'verified'
  | 'closed';

export type MaintenancePayoutStatus = 'requested' | 'approved' | 'rejected' | 'paid';

export interface MaintenancePayout {
  id: string;
  code: string;
  maintenanceId: string;
  propertyId: string;
  staffId: string;
  amount: number;
  materialsAmount?: number | null;
  labourAmount?: number | null;
  note?: string | null;
  status: MaintenancePayoutStatus;
  requestedAt?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  paidById?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  expenseId?: string | null;
  createdAt?: string | null;
  /** Bank details snapshotted from the technician's membership when requested. */
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankCode?: string | null;
}

/** Inspection checkpoints carried out over the life of a work order. */
export type MaintenanceRoundStage =
  | 'triage' // after the complaint — confirm the issue and its severity
  | 'progress' // during the repair — track cost and quality of work
  | 'final'; // after the repair — confirm work done and materials match spec

export interface MaintenanceRound {
  id: string;
  stage: MaintenanceRoundStage;
  date: string;
  byId: string; // user who carried out the round
  outcome: 'ok' | 'issues';
  findings: string;
  photos?: string[];
}

export interface MaintenanceRequest {
  id: string;
  code: string;
  propertyId: string;
  unitId: string;
  tenantId?: string;
  title: string;
  category: string;
  description: string;
  urgency: MaintenanceUrgency;
  status: MaintenanceStatus;
  createdAt: string;
  assignedToId?: string; // maintenance staff / vendor
  vendorId?: string;
  materialsCost: number;
  labourCost: number;
  specifiedMaterials?: string; // what the owner/manager specified
  actualMaterials?: string; // what was actually used, recorded at completion
  materialsMatch?: boolean; // confirmed at verification
  rounds: MaintenanceRound[]; // triage / progress / final inspection rounds
  photos: string[]; // "before" evidence hints
  afterPhotos: string[]; // "after" evidence hints
  completedAt?: string;
  tenantConfirmedAt?: string;
  tenantConfirmedById?: string;
  verifiedById?: string;
  closedAt?: string;
}

// ---- Expenses & vendors ----------------------------------------------------

export type ExpenseCategory =
  | 'repairs'
  | 'security'
  | 'cleaning'
  | 'utilities'
  | 'fuel'
  | 'insurance'
  | 'tax'
  | 'staff'
  | 'management-fee'
  | 'other';

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface Expense {
  id: string;
  code: string;
  propertyId: string;
  category: ExpenseCategory;
  vendorId?: string;
  description: string;
  amount: number;
  date: string;
  status: ExpenseStatus;
  receiptFileName?: string;
  approvedById?: string;
}

export interface Vendor {
  id: string;
  name: string;
  service: string;
  phone: string;
  email: string;
  ownerId: string;
  totalPaid: number;
  outstanding: number;
}

// ---- Inspections -----------------------------------------------------------

export type InspectionType =
  | 'move-in'
  | 'routine'
  | 'maintenance'
  | 'move-out';

export type InspectionStatus = 'scheduled' | 'completed' | 'cancelled';

export interface InspectionItem {
  area: string;
  condition: 'good' | 'fair' | 'poor' | 'damaged';
  notes?: string;
}

export interface Inspection {
  id: string;
  code: string;
  propertyId: string;
  unitId: string;
  tenantId?: string;
  type: InspectionType;
  status: InspectionStatus;
  scheduledDate: string;
  completedDate?: string;
  inspectorId?: string;
  items: InspectionItem[];
  depositDeductions?: number;
  notes?: string;
}

// ---- Utilities / meters ----------------------------------------------------

export type MeterType = 'electricity' | 'water' | 'gas' | 'other';

export interface MeterReading {
  date: string;
  value: number;
}

export interface Meter {
  id: string;
  propertyId: string;
  unitId?: string;
  type: MeterType;
  meterNumber: string;
  unitOfMeasure: string;
  previousReading: number;
  currentReading: number;
  ratePerUnit: number;
  history: MeterReading[];
  /** The reading the tenant has been invoiced up to; unset until a bill is raised. */
  billedReading?: number | null;
  billedAt?: string | null;
  /** Server-computed: use read but not yet invoiced. */
  unbilledUnits?: number;
  unbilledAmount?: number;
}

// ---- Listings & leads ------------------------------------------------------

export type ListingStatus = 'published' | 'draft' | 'let' | 'archived';

export interface Listing {
  id: string;
  propertyId: string;
  unitId: string;
  title: string;
  price: number;
  status: ListingStatus;
  publishedAt: string;
  description: string;
  agentId?: string;
}

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'viewing-scheduled'
  | 'negotiating'
  | 'converted'
  | 'lost';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  listingId?: string;
  propertyId?: string;
  status: LeadStatus;
  agentId?: string;
  createdAt: string;
  viewingDate?: string;
  notes?: string;
}

// ---- Documents -------------------------------------------------------------

export type DocumentCategory =
  | 'deed'
  | 'lease-agreement'
  | 'tenant-id'
  | 'guarantor'
  | 'inspection'
  | 'invoice'
  | 'receipt'
  | 'maintenance'
  | 'vendor-contract'
  | 'insurance'
  | 'tax'
  | 'other';

export interface DocumentRecord {
  id: string;
  name: string;
  category: DocumentCategory;
  propertyId?: string;
  unitId?: string;
  tenantId?: string;
  fileType: 'pdf' | 'jpg' | 'png' | 'docx';
  sizeKb: number;
  uploadedAt: string;
  uploadedById: string;
}

// ---- Communication / notices / notifications -------------------------------

export type NotificationKind =
  | 'rent'
  | 'payment'
  | 'lease'
  | 'maintenance'
  | 'inspection'
  | 'announcement'
  | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  forRole?: Role;
  forUserId?: string;
  link?: string;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  propertyId?: string;
  audience: 'all' | 'owners' | 'tenants' | 'staff';
  createdAt: string;
  createdById: string;
}

export interface Message {
  id: string;
  threadId: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: string;
  read: boolean;
}

// ---- Audit trail -----------------------------------------------------------

export type AuditAction =
  | 'login'
  | 'logout'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'payment-submit'
  | 'payment-approve'
  | 'payment-reject'
  | 'refund'
  | 'permission-change'
  | 'document-access'
  | 'export';

export interface AuditLog {
  id: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  userId: string;
  summary: string;
  timestamp: string;
  ip?: string;
  device?: string;
}

// ---- Tasks & calendar ------------------------------------------------------

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
  assignedToId?: string;
  propertyId?: string;
  priority: 'low' | 'medium' | 'high';
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  kind: 'inspection' | 'viewing' | 'lease' | 'maintenance' | 'payment' | 'task';
  refId?: string;
}

// ---- Admin singletons (served by the backend) ----------------------------

export interface OrganizationSettings {
  name: string;
  supportEmail: string;
  currency: string;
  timezone: string;
  fiscalYearStart: string;
  lateFeePercent: number;
  gracePeriodDays: number;
  invoicePrefix: string;
  address: string;
}

export interface IntegrationSetting {
  enabled: boolean;
  label?: string;
  category?: string;
  /** Set by the backend: whether real credentials are present (e.g. Paystack keys). */
  configured?: boolean;
}

export type IntegrationsMap = Record<string, IntegrationSetting>;

export interface RbacMatrix {
  roles: Role[];
  permissions: Record<string, Permission[]>;
  resources: Record<string, { view: Role[]; manage: Role[] }>;
}

// ---- Dashboard rollup (GET /api/v1/dashboard, server-computed) -----------

export interface DashboardKpis {
  totalProperties: number;
  totalBuildings: number;
  totalUnits: number;
  occupied: number;
  vacant: number;
  reserved: number;
  maintenance: number;
  underRenovation: number;
  totalTenants: number;
  activeLeases: number;
  expiringLeases: number;
  annualRentRoll: number;
  expectedBilled: number;
  collected: number;
  outstanding: number;
  overdue: number;
  totalExpenses: number;
  netIncome: number;
  openMaintenance: number;
  pendingVerifications: number;
  occupancyRate: number;
  collectionRate: number;
}

export interface DashboardPropertyRow {
  propertyId: string;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  units: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
  annualRentRoll: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
  netIncome: number;
}

export type DashboardPersona =
  | 'portfolio'
  | 'finance'
  | 'operations'
  | 'leasing'
  | 'maintenance'
  | 'newcomer';

export interface DashboardExpiringLease {
  id: string;
  code: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  endDate: string;
  rent: number;
}

export interface DashboardOverdueInvoice {
  id: string;
  code: string;
  propertyId: string;
  tenantId: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  outstanding: number;
}

export interface DashboardPendingPayment {
  id: string;
  code: string;
  propertyId: string;
  tenantId: string;
  invoiceId: string;
  amount: number;
  method: string;
  paymentDate: string;
  submittedAt: string;
}

export interface DashboardPendingExpense {
  id: string;
  code: string;
  propertyId: string;
  vendorId: string | null;
  category: string;
  description: string;
  amount: number;
  date: string;
}

export interface DashboardMaintenanceQueue {
  byStatus: Record<'open' | 'assigned' | 'in-progress' | 'completed' | 'verified' | 'closed', number>;
  byUrgency: Record<'emergency' | 'high' | 'medium' | 'low', number>;
  openCount: number;
  emergencyCount: number;
  items: {
    id: string;
    code: string;
    title: string;
    category: string;
    urgency: MaintenanceUrgency;
    status: MaintenanceStatus;
    propertyId: string;
    unitId: string | null;
    assignedToId: string | null;
    createdAt: string;
  }[];
}

export interface DashboardLeasingBoard {
  liveListings: number;
  activeLeads: number;
  viewingsScheduled: number;
  convertedLeads: number;
  vacantUnits: number;
  leadFunnel: Record<'new' | 'contacted' | 'viewing-scheduled' | 'negotiating' | 'converted' | 'lost', number>;
  recentLeads: {
    id: string;
    name: string;
    status: LeadStatus;
    propertyId: string | null;
    listingId: string | null;
    agentId: string | null;
    createdAt: string;
    viewingDate: string | null;
  }[];
  availableUnits: {
    id: string;
    code: string;
    type: string;
    propertyId: string;
    buildingId: string | null;
    rent: number;
    status: UnitStatus;
  }[];
}

export interface DashboardData {
  role: Role;
  persona: DashboardPersona;
  kpis: DashboardKpis;
  rentTrend: { month: string; billed: number; collected: number }[];
  recentActivity: {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    userId: string | null;
    summary: string;
    timestamp: string;
  }[];
  // Persona-specific blocks — present only for the personas that render them.
  unitStatus?: {
    occupied: number;
    available: number;
    reserved: number;
    maintenance: number;
    renovation: number;
    unavailable: number;
  };
  occupancyByProperty?: DashboardPropertyRow[];
  expiringLeases?: DashboardExpiringLease[];
  overdueInvoices?: DashboardOverdueInvoice[];
  pendingPayments?: DashboardPendingPayment[];
  expensesPending?: DashboardPendingExpense[];
  expensesByCategory?: { category: string; count: number; total: number }[];
  maintenanceQueue?: DashboardMaintenanceQueue;
  leasing?: DashboardLeasingBoard;
}

// ---- Resident portal home (GET /api/v1/portal, server-computed) ----------

export interface PortalData {
  linked: boolean;
  tenant?: Pick<Tenant, 'id' | 'name' | 'email' | 'phone' | 'avatarColor'> | null;
  lease?: Lease | null;
  unit?: Unit | null;
  property?: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    amenities: string[];
  } | null;
  building?: { id: string; name: string } | null;
  balance?: number;
  nextDue?: { id: string; code: string; dueDate: string; outstanding: number } | null;
  openInvoicesCount?: number;
  pendingPaymentsCount?: number;
  openRequestsCount?: number;
  recentPayments?: Pick<Payment, 'id' | 'code' | 'amount' | 'method' | 'type' | 'paymentDate' | 'reference' | 'status'>[];
  recentRequests?: Pick<MaintenanceRequest, 'id' | 'code' | 'title' | 'category' | 'urgency' | 'status' | 'createdAt'>[];
  notices?: Pick<Notice, 'id' | 'title' | 'body' | 'audience' | 'createdAt' | 'propertyId'>[];
}

// ---- Auto-debit (tenant rent charged to a saved card) -----------------------

export type AutoDebitInvoiceState = 'scheduled' | 'processing' | 'retrying' | 'manual';

export interface AutoDebitCardInfo {
  brand: string | null;
  last4: string | null;
  expMonth: string | null;
  expYear: string | null;
  bank: string | null;
  /** e.g. "Visa •••• 4081" */
  label: string;
}

export interface AutoDebitUpcoming {
  invoiceId: string;
  code: string;
  dueDate: string;
  amount: number;
  state: AutoDebitInvoiceState;
  attempts: number;
  nextAttemptOn: string | null;
  lastReason: string | null;
}

export interface AutoDebitStatus {
  /** Paystack is configured on the server. */
  available: boolean;
  enabled: boolean;
  /** `none` before first setup; `expired` when the saved card lapsed or was revoked. */
  status: 'none' | 'active' | 'cancelled' | 'expired';
  card: AutoDebitCardInfo | null;
  enrolledAt: string | null;
  setupAmount: number;
  maxAttempts: number;
  upcoming: AutoDebitUpcoming[];
}

// ---- Auto-debit: what property staff see per invoice -------------------------

export type AutoDebitStaffState = 'scheduled' | 'processing' | 'retrying' | 'manual' | 'paid' | 'partial';

export interface AutoDebitInvoiceInfo {
  state: AutoDebitStaffState;
  attempts: number;
  nextAttemptOn: string | null;
  lastReason: string | null;
  dueDate: string | null;
}

export interface AutoDebitOverview {
  /** Tenants (with invoices you can see) who currently have auto-debit on. */
  enrolledTenants: string[];
  /** Keyed by invoice id; invoices with no auto-debit involvement are absent. */
  invoices: Record<string, AutoDebitInvoiceInfo>;
  counts: Record<AutoDebitStaffState, number>;
}

export interface AutoDebitAttemptRow {
  attemptNo: number;
  status: 'pending' | 'success' | 'failed';
  amount: number;
  reason: string | null;
  attemptedAt: string;
  nextAttemptOn: string | null;
  paymentId: string | null;
}

export interface AutoDebitInvoiceDetail {
  enrolled: boolean;
  state: AutoDebitStaffState | null;
  maxAttempts: number;
  attempts: AutoDebitAttemptRow[];
}
