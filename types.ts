export enum Role {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
  CASHIER = 'cashier'
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  token?: string; // JWT token
  phone?: string;
  avatar?: string;
  store_credit?: number;
  is_active?: boolean;
  two_factor_enabled?: boolean;
  oauth_provider?: string | null;
  last_login?: string;
  email_verified?: boolean;
}

export interface Address {
  id: number;
  user_id: number;
  recipient_name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
}

export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  partNumber: string; // New: CODE
  name: string; // PRODUCT
  description: string;
  price: number; // RETAIL (Selling Price)
  buyingPrice: number; // New: COST
  image: string;
  category_id: number;
  category_name?: string; // MOTOR NAME (e.g. NMAX, AEROX)
  stock_quantity: number; // QTY
  boxNumber: string; // New: BOX
  low_stock_threshold: number;
  created_at?: string;
  updated_at?: string;
  brand?: string; // New
  rating?: number; // New
  reviewCount?: number; // New
  sale_price?: number; // New: Sprint 8
  is_on_sale?: boolean; // New: Sprint 8
  sku?: string; // New: Sprint 9
  barcode?: string; // New: Sprint 9
}

export interface AuthResponse {
  user: User;
  token: string;
  requires_2fa?: boolean;
}

export interface CartItem {
  productId: number;
  product: Product;
  quantity: number;
}

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  SHIPPED = 'shipped',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface Order {
  id: number;
  user_id?: number; // null for guest
  guest_info?: {
    name: string;
    email: string;
  };
  items: CartItem[];
  total_amount: number;
  status: OrderStatus;
  shipping_address: string;
  created_at: string;
  // POS Specific Fields
  source: 'online' | 'pos';
  payment_method?: 'cash' | 'card';
  amount_tendered?: number;
  change_due?: number;
  cashier_id?: number;
  // Sprint 8
  discount_amount?: number;
  promo_code_used?: string;
}

export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REFUNDED = 'refunded'
}

export interface ReturnRequest {
  id: number;
  order_id: number;
  user_id: number;
  items: {
    productId: number;
    productName: string;
    quantity: number;
    price: number;
  }[];
  reason: string;
  status: ReturnStatus;
  refund_amount: number;
  type: 'online' | 'pos';
  created_at: string;
}

export interface SupportTicket {
  id: number;
  user_id?: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'closed';
  created_at: string;
}

export interface FAQ {
  id: number;
  question: string;
  answer: string;
}

export interface WishlistItem {
  id: number;
  product_id: number;
  user_id: number;
  product: Product;
}

export interface Review {
  id: number;
  product_id: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

// Sprint 8: Promotions & Discounts
export type DiscountType = 'percentage' | 'fixed';

export interface Discount {
  id: number;
  code: string;
  type: DiscountType;
  value: number;
  min_purchase?: number;
  max_uses?: number;
  used_count: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

export interface Promotion {
  id: number;
  name: string;
  type: 'free_shipping' | 'auto_discount';
  threshold_amount: number;
  discount_value: number;
  is_active: boolean;
}

// Sprint 9: Advanced Inventory
export interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
}

export type POStatus = 'draft' | 'sent' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  product_id: number;
  product_name: string;
  quantity: number;
  received_quantity?: number;
}

export interface PurchaseOrder {
  id: number;
  supplier_id: number;
  supplier_name: string;
  status: POStatus;
  items: PurchaseOrderItem[];
  expected_date: string;
  created_at: string;
}

export type AdjustmentReason = 'damaged' | 'lost' | 'correction' | 'transfer' | 'received';

export interface StockAdjustment {
  id: number;
  product_id: number;
  product_name: string;
  quantity_change: number;
  reason: AdjustmentReason;
  note: string;
  created_at: string;
  user_id?: number;
}

// Sprint 10: Enhanced Reporting
export interface SalesReportItem {
  name: string;
  value: number;
}

export interface TopProductMetric {
  name: string;
  quantity: number;
  revenue: number;
}

export interface InventoryValuationItem {
  category: string;
  count: number;
  value: number;
}

export interface CustomerGrowthItem {
  date: string;
  newCustomers: number;
}

export interface PaymentMethodStat {
  method: string;
  count: number;
  total: number;
}

export interface DashboardStats {
  totalSales: number;
  totalProfit: number; // New
  totalOrders: number;
  avgOrderValue: number; // New
  lowStockCount: number;
  salesTrend: { date: string; amount: number; orders: number; profit: number }[]; // Updated
  salesByChannel: { name: string; value: number }[];
  salesByCategory: SalesReportItem[]; // New
  topProducts: TopProductMetric[]; // New
  inventoryValuation: InventoryValuationItem[]; // New
  customerGrowth: CustomerGrowthItem[]; // New
  paymentMethods: PaymentMethodStat[]; // New
  pendingReturns: number;
  openTickets: number;
}

// ─── Auth & Staff Management (Sprint Auth) ─────────────────────────

export interface ActivityLog {
  id: number;
  user_id: number | null;
  user_name?: string;
  user_email?: string;
  action: string;
  entity_type?: string;
  entity_id?: number;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface Session {
  id: number;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active: string;
}

export interface Permission {
  id: number;
  name: string;
  description: string;
  category: string;
  granted?: boolean;
}

export interface StaffMember {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatar?: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  two_factor_enabled?: boolean;
  oauth_provider?: string | null;
  failed_login_attempts?: number;
  action_count?: number;
  last_activity?: string;
  permissions?: Permission[];
}

export interface StaffPerformance {
  period: number;
  orders: {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
  };
  logins: number;
  topActions: { action: string; count: number }[];
  returnsProcessed: number;
}