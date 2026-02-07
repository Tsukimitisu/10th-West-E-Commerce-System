import { User, Product, Category, Role, AuthResponse, Order, OrderStatus, CartItem, DashboardStats, Address, ReturnRequest, ReturnStatus, SupportTicket, FAQ, WishlistItem, Review, Discount, Promotion, Supplier, PurchaseOrder, StockAdjustment, AdjustmentReason, ActivityLog, Session, Permission, StaffMember, StaffPerformance } from '../types';

// API Configuration - auto-detect for LAN usage
const API_URL = import.meta.env.VITE_API_URL || (() => {
  // If running on localhost, use localhost; otherwise use current hostname (LAN IP)
  const host = window.location.hostname;
  return `http://${host}:5000/api`;
})();
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK === 'true';

// Helper function to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('shopCoreToken');
};

// Helper function to make authenticated requests
const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
};

// ==================== AUTHENTICATION ====================

export const login = async (email: string, password: string, totp_code?: string): Promise<AuthResponse> => {
  if (USE_MOCK_DATA) {
    return loginMock(email, password);
  }

  const data = await authenticatedFetch(`${API_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password, totp_code }),
  });

  if (data.requires_2fa) {
    return { user: {} as User, token: '', requires_2fa: true };
  }

  return { user: data.user, token: data.token };
};

export const register = async (name: string, email: string, password: string): Promise<AuthResponse> => {
  if (USE_MOCK_DATA) {
    return registerMock(name, email, password);
  }

  const data = await authenticatedFetch(`${API_URL}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });

  return { user: data.user, token: data.token };
};

// Auth: Additional endpoints
export const logoutApi = async (): Promise<void> => {
  await authenticatedFetch(`${API_URL}/auth/logout`, { method: 'POST' });
};

export const forgotPassword = async (email: string): Promise<{ message: string }> => {
  return authenticatedFetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = async (token: string, email: string, newPassword: string): Promise<{ message: string }> => {
  return authenticatedFetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ token, email, newPassword }),
  });
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<{ message: string }> => {
  return authenticatedFetch(`${API_URL}/auth/change-password`, {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};

// 2FA
export const setup2FA = async (): Promise<{ secret: string; qrCode: string }> => {
  return authenticatedFetch(`${API_URL}/auth/2fa/setup`);
};

export const verify2FA = async (totp_code: string): Promise<{ message: string }> => {
  return authenticatedFetch(`${API_URL}/auth/2fa/verify`, {
    method: 'POST',
    body: JSON.stringify({ totp_code }),
  });
};

export const disable2FA = async (password: string): Promise<{ message: string }> => {
  return authenticatedFetch(`${API_URL}/auth/2fa`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
};

// Sessions
export const getActiveSessions = async (): Promise<Session[]> => {
  return authenticatedFetch(`${API_URL}/auth/sessions`);
};

export const revokeSession = async (sessionId: number): Promise<void> => {
  await authenticatedFetch(`${API_URL}/auth/sessions/${sessionId}`, { method: 'DELETE' });
};

// Activity Logs (admin)
export const getActivityLogs = async (params: { page?: number; limit?: number; userId?: number; action?: string } = {}): Promise<{ logs: ActivityLog[]; total: number; page: number; totalPages: number }> => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.userId) qs.set('userId', String(params.userId));
  if (params.action) qs.set('action', String(params.action));
  return authenticatedFetch(`${API_URL}/auth/activity-logs?${qs.toString()}`);
};

// ==================== STAFF MANAGEMENT ====================

export const getStaffList = async (params: { page?: number; role?: string; status?: string; search?: string } = {}): Promise<{ staff: StaffMember[]; total: number; page: number; totalPages: number }> => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.role) qs.set('role', params.role);
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  return authenticatedFetch(`${API_URL}/staff?${qs.toString()}`);
};

export const getStaffById = async (id: number): Promise<StaffMember> => {
  return authenticatedFetch(`${API_URL}/staff/${id}`);
};

export const addStaff = async (data: { name: string; email: string; password: string; role: string; phone?: string }): Promise<{ staff: StaffMember }> => {
  return authenticatedFetch(`${API_URL}/staff`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const editStaff = async (id: number, data: { name: string; email: string; role: string; phone?: string; password?: string }): Promise<{ staff: StaffMember }> => {
  return authenticatedFetch(`${API_URL}/staff/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const toggleStaffStatus = async (id: number): Promise<{ staff: StaffMember }> => {
  return authenticatedFetch(`${API_URL}/staff/${id}/status`, { method: 'PATCH' });
};

export const deleteStaff = async (id: number): Promise<void> => {
  await authenticatedFetch(`${API_URL}/staff/${id}`, { method: 'DELETE' });
};

export const getStaffActivity = async (id: number, page = 1): Promise<{ logs: ActivityLog[]; total: number; page: number; totalPages: number }> => {
  return authenticatedFetch(`${API_URL}/staff/${id}/activity?page=${page}`);
};

export const updateStaffPermissions = async (id: number, permissions: { permission_id: number; granted: boolean }[]): Promise<void> => {
  await authenticatedFetch(`${API_URL}/staff/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
};

export const getAllPermissions = async (): Promise<Permission[]> => {
  return authenticatedFetch(`${API_URL}/staff/permissions`);
};

export const getStaffPerformance = async (id: number, period = 30): Promise<StaffPerformance> => {
  return authenticatedFetch(`${API_URL}/staff/${id}/performance?period=${period}`);
};

// ==================== PRODUCTS ====================

export const getProducts = async (): Promise<Product[]> => {
  if (USE_MOCK_DATA) {
    return getProductsMock();
  }

  const products = await authenticatedFetch(`${API_URL}/products`);
  
  // Map backend fields to frontend fields
  return products.map((p: any) => ({
    ...p,
    partNumber: p.part_number,
    buyingPrice: p.buying_price,
    boxNumber: p.box_number,
  }));
};

export const getProductById = async (id: number): Promise<Product> => {
  if (USE_MOCK_DATA) {
    return getProductByIdMock(id);
  }

  const product = await authenticatedFetch(`${API_URL}/products/${id}`);
  
  return {
    ...product,
    partNumber: product.part_number,
    buyingPrice: product.buying_price,
    boxNumber: product.box_number,
  };
};

export const addProduct = async (product: Partial<Product>): Promise<Product> => {
  if (USE_MOCK_DATA) {
    return addProductMock(product);
  }

  // Map frontend fields to backend fields
  const backendProduct = {
    part_number: product.partNumber,
    name: product.name,
    description: product.description,
    price: product.price,
    buying_price: product.buyingPrice,
    image: product.image,
    category_id: product.category_id,
    stock_quantity: product.stock_quantity,
    box_number: product.boxNumber,
    low_stock_threshold: product.low_stock_threshold,
    brand: product.brand,
    sku: product.sku,
    barcode: product.barcode,
  };

  const data = await authenticatedFetch(`${API_URL}/products`, {
    method: 'POST',
    body: JSON.stringify(backendProduct),
  });

  return {
    ...data.product,
    partNumber: data.product.part_number,
    buyingPrice: data.product.buying_price,
    boxNumber: data.product.box_number,
  };
};

export const updateProduct = async (id: number, product: Partial<Product>): Promise<Product> => {
  if (USE_MOCK_DATA) {
    return updateProductMock(id, product);
  }

  const backendProduct = {
    part_number: product.partNumber,
    name: product.name,
    description: product.description,
    price: product.price,
    buying_price: product.buyingPrice,
    image: product.image,
    category_id: product.category_id,
    stock_quantity: product.stock_quantity,
    box_number: product.boxNumber,
    low_stock_threshold: product.low_stock_threshold,
    brand: product.brand,
    sku: product.sku,
    barcode: product.barcode,
    sale_price: product.sale_price,
    is_on_sale: product.is_on_sale,
  };

  const data = await authenticatedFetch(`${API_URL}/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(backendProduct),
  });

  return {
    ...data.product,
    partNumber: data.product.part_number,
    buyingPrice: data.product.buying_price,
    boxNumber: data.product.box_number,
  };
};

export const deleteProduct = async (id: number): Promise<void> => {
  if (USE_MOCK_DATA) {
    return deleteProductMock(id);
  }

  await authenticatedFetch(`${API_URL}/products/${id}`, {
    method: 'DELETE',
  });
};

// ==================== CATEGORIES ====================

export const getCategories = async (): Promise<Category[]> => {
  if (USE_MOCK_DATA) {
    return getCategoriesMock();
  }

  return await authenticatedFetch(`${API_URL}/categories`);
};

export const addCategory = async (name: string): Promise<Category> => {
  if (USE_MOCK_DATA) {
    return addCategoryMock(name);
  }

  const data = await authenticatedFetch(`${API_URL}/categories`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  return data.category;
};

export const updateCategory = async (id: number, name: string): Promise<Category> => {
  if (USE_MOCK_DATA) {
    return updateCategoryMock(id, name);
  }

  const data = await authenticatedFetch(`${API_URL}/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });

  return data.category;
};

export const deleteCategory = async (id: number): Promise<void> => {
  if (USE_MOCK_DATA) {
    return deleteCategoryMock(id);
  }

  await authenticatedFetch(`${API_URL}/categories/${id}`, {
    method: 'DELETE',
  });
};

// ==================== MOCK DATA (Fallback) ====================
// Keep existing mock data and functions for development/testing

const MOCK_CATEGORIES: Category[] = [
  { id: 1, name: 'NMAX V1' },
  { id: 2, name: 'NMAX V2' },
  { id: 3, name: 'AEROX V1' },
  { id: 4, name: 'AEROX V2' },
  { id: 5, name: 'M3 MIO' },
  { id: 6, name: 'CLICK 150' },
  { id: 7, name: 'CLICK 125' },
  { id: 8, name: 'BEAT V2' },
  { id: 9, name: 'Universal Parts' },
];

let MOCK_PRODUCTS: Product[] = [
  {
    id: 1,
    partNumber: '2DP-H2129-00',
    name: 'Battery Cover',
    description: 'Original Yamaha Battery Cover for NMAX V1.',
    price: 150.00,
    buyingPrice: 104.00,
    image: 'https://images.unsplash.com/photo-1558564175-99645903c7bb?auto=format&fit=crop&q=80&w=400',
    category_id: 1,
    category_name: 'NMAX V1',
    stock_quantity: 2,
    boxNumber: '2F STAIRS',
    low_stock_threshold: 2,
    brand: 'Yamaha',
    rating: 4.5,
    reviewCount: 12,
    sku: 'SKU-001',
    barcode: '123456789012'
  },
];

const MOCK_USERS: User[] = [
  { id: 1, name: 'Admin User', email: 'admin@10thwest.com', role: Role.ADMIN },
  { id: 2, name: 'Moto Rider', email: 'customer@10thwest.com', role: Role.CUSTOMER },
  { id: 3, name: 'Cashier Staff', email: 'cashier@10thwest.com', role: Role.CASHIER }
];

// Mock authentication functions
const loginMock = async (email: string, password: string): Promise<AuthResponse> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const user = MOCK_USERS.find(u => u.email === email);
  if (!user) throw new Error('Invalid credentials');
  
  if (
    (email === 'admin@10thwest.com' && password === 'admin123') ||
    (email === 'cashier@10thwest.com' && password === 'cashier123') ||
    (email === 'customer@10thwest.com' && password === 'customer123')
  ) {
    const token = 'mock-jwt-token-' + Math.random();
    return { user, token };
  }
  
  throw new Error('Invalid credentials');
};

const registerMock = async (name: string, email: string, password: string): Promise<AuthResponse> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const newUser: User = {
    id: MOCK_USERS.length + 1,
    name,
    email,
    role: Role.CUSTOMER
  };
  
  MOCK_USERS.push(newUser);
  const token = 'mock-jwt-token-' + Math.random();
  
  return { user: newUser, token };
};

// Mock product functions
const getProductsMock = async (): Promise<Product[]> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  return [...MOCK_PRODUCTS];
};

const getProductByIdMock = async (id: number): Promise<Product> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  const product = MOCK_PRODUCTS.find(p => p.id === id);
  if (!product) throw new Error('Product not found');
  return product;
};

const addProductMock = async (product: Partial<Product>): Promise<Product> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newProduct: Product = {
    id: MOCK_PRODUCTS.length + 1,
    ...product as Product,
  };
  MOCK_PRODUCTS.push(newProduct);
  return newProduct;
};

const updateProductMock = async (id: number, updates: Partial<Product>): Promise<Product> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_PRODUCTS.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Product not found');
  MOCK_PRODUCTS[index] = { ...MOCK_PRODUCTS[index], ...updates };
  return MOCK_PRODUCTS[index];
};

const deleteProductMock = async (id: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  MOCK_PRODUCTS = MOCK_PRODUCTS.filter(p => p.id !== id);
};

// Mock category functions
const getCategoriesMock = async (): Promise<Category[]> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  return [...MOCK_CATEGORIES];
};

const addCategoryMock = async (name: string): Promise<Category> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newCategory: Category = {
    id: MOCK_CATEGORIES.length + 1,
    name,
  };
  MOCK_CATEGORIES.push(newCategory);
  return newCategory;
};

const updateCategoryMock = async (id: number, name: string): Promise<Category> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_CATEGORIES.findIndex(c => c.id === id);
  if (index === -1) throw new Error('Category not found');
  MOCK_CATEGORIES[index].name = name;
  return MOCK_CATEGORIES[index];
};

const deleteCategoryMock = async (id: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_CATEGORIES.findIndex(c => c.id === id);
  if (index > -1) {
    MOCK_CATEGORIES.splice(index, 1);
  }
};

// ==================== ORDERS ====================

const mapOrderItemToCartItem = (item: any): CartItem => {
  const productId = item.product_id ?? item.productId ?? item.product?.id ?? 0;
  const product: Product = {
    id: productId,
    partNumber: item.product_part_number ?? item.product?.partNumber ?? '',
    name: item.product_name ?? item.product?.name ?? 'Unknown Item',
    description: item.product?.description ?? '',
    price: Number(item.product_price ?? item.product_price_current ?? item.product?.price ?? 0),
    buyingPrice: Number(item.product_buying_price ?? item.product?.buyingPrice ?? 0),
    image: item.product_image ?? item.product?.image ?? '',
    category_id: item.product_category_id ?? item.product?.category_id ?? 0,
    stock_quantity: item.product_stock_quantity ?? item.product?.stock_quantity ?? 0,
    boxNumber: item.product_box_number ?? item.product?.boxNumber ?? '',
    low_stock_threshold: item.product_low_stock_threshold ?? item.product?.low_stock_threshold ?? 0,
    sale_price: item.product_sale_price ?? item.product?.sale_price,
    is_on_sale: item.product_is_on_sale ?? item.product?.is_on_sale,
    sku: item.product_sku ?? item.product?.sku,
    barcode: item.product_barcode ?? item.product?.barcode,
  };

  return {
    productId,
    product,
    quantity: Number(item.quantity ?? item.qty ?? 1),
  };
};

const mapOrderFromApi = (order: any): Order => ({
  id: order.id,
  user_id: order.user_id ?? undefined,
  guest_info: order.guest_name
    ? { name: order.guest_name, email: order.guest_email }
    : order.guest_info,
  items: Array.isArray(order.items) ? order.items.map(mapOrderItemToCartItem) : [],
  total_amount: Number(order.total_amount ?? 0),
  status: order.status as OrderStatus,
  shipping_address: order.shipping_address ?? '',
  created_at: order.created_at ?? new Date().toISOString(),
  source: order.source ?? 'online',
  payment_method: order.payment_method,
  amount_tendered: order.amount_tendered != null ? Number(order.amount_tendered) : undefined,
  change_due: order.change_due != null ? Number(order.change_due) : undefined,
  cashier_id: order.cashier_id ?? undefined,
  discount_amount: order.discount_amount != null ? Number(order.discount_amount) : undefined,
  promo_code_used: order.promo_code_used ?? undefined,
});

let MOCK_ORDERS: Order[] = [];

export const getOrders = async (): Promise<Order[]> => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...MOCK_ORDERS];
  }

  const data = await authenticatedFetch(`${API_URL}/orders`);
  return data.map(mapOrderFromApi);
};

export const getUserOrders = async (userId: number): Promise<Order[]> => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_ORDERS.filter(order => order.user_id === userId);
  }

  const data = await authenticatedFetch(`${API_URL}/orders/my-orders`);
  return data.map(mapOrderFromApi);
};

export const getOrderById = async (id: number): Promise<Order> => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    return order;
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}`);
  return mapOrderFromApi(data);
};

export const createOrder = async (order: Partial<Order>): Promise<Order> => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newOrder: Order = {
      id: MOCK_ORDERS.length + 1001,
      user_id: order.user_id,
      items: order.items || [],
      total_amount: order.total_amount || 0,
      status: OrderStatus.PENDING,
      shipping_address: order.shipping_address || '',
      created_at: new Date().toISOString(),
      source: order.source || 'online',
      payment_method: order.payment_method,
      guest_info: order.guest_info,
    };
    MOCK_ORDERS.push(newOrder);
    return newOrder;
  }

  const items = (order.items || []).map(item => ({
    product_id: (item as CartItem).productId ?? (item as any).product_id,
    quantity: (item as CartItem).quantity ?? (item as any).quantity,
  }));

  const payload = {
    ...order,
    items,
  };

  const data = await authenticatedFetch(`${API_URL}/orders`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const mapped = mapOrderFromApi(data.order ?? data);
  if (order.items && order.items.length > 0) {
    mapped.items = order.items as CartItem[];
  }
  return mapped;
};

export const updateOrderStatus = async (id: number, status: OrderStatus): Promise<Order> => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    order.status = status;
    return order;
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });

  return mapOrderFromApi(data.order ?? data);
};

// ==================== DASHBOARD STATS (Mock) ====================

export const getDashboardStats = async (): Promise<DashboardStats> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const totalRevenue = MOCK_ORDERS.reduce((sum, order) => sum + order.total_amount, 0);
  const totalOrders = MOCK_ORDERS.length;
  const totalProducts = MOCK_PRODUCTS.length;
  const lowStockProducts = MOCK_PRODUCTS.filter(p => p.stock_quantity <= p.low_stock_threshold).length;
  
  return {
    totalRevenue,
    totalOrders,
    totalProducts,
    lowStockProducts,
    recentOrders: MOCK_ORDERS.slice(-5).reverse(),
  };
};

// ==================== ADDRESSES ====================

export const getUserAddresses = async (userId: number): Promise<Address[]> => {
  const data = await authenticatedFetch(`${API_URL}/addresses`);
  return data;
};

export const addAddress = async (address: Omit<Address, 'id'>): Promise<Address> => {
  const data = await authenticatedFetch(`${API_URL}/addresses`, {
    method: 'POST',
    body: JSON.stringify(address),
  });
  return data.address;
};

export const updateAddress = async (id: number, updates: Partial<Address>): Promise<Address> => {
  const data = await authenticatedFetch(`${API_URL}/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.address;
};

export const deleteAddress = async (id: number): Promise<void> => {
  await authenticatedFetch(`${API_URL}/addresses/${id}`, {
    method: 'DELETE',
  });
};

// ==================== RETURNS & REFUNDS ====================

export const getReturns = async (userId: number): Promise<ReturnRequest[]> => {
  const data = await authenticatedFetch(`${API_URL}/returns/my-returns`);
  return data;
};

export const createReturn = async (returnRequest: Partial<ReturnRequest>): Promise<ReturnRequest> => {
  const data = await authenticatedFetch(`${API_URL}/returns`, {
    method: 'POST',
    body: JSON.stringify(returnRequest),
  });
  return data.return;
};

export const updateReturnStatus = async (id: number, status: ReturnStatus): Promise<ReturnRequest> => {
  const endpoint = status === 'approved' ? 'approve' : 'reject';
  const data = await authenticatedFetch(`${API_URL}/returns/${id}/${endpoint}`, {
    method: 'PUT',
  });
  return data.return;
};

export const processRefund = async (id: number, method: 'original' | 'store_credit'): Promise<any> => {
  const data = await authenticatedFetch(`${API_URL}/returns/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  });
  return data;
};

export const getUserStoreCredit = async (): Promise<{ balance: number }> => {
  const data = await authenticatedFetch(`${API_URL}/returns/store-credit`);
  return data;
};

// ==================== SUPPORT TICKETS ====================

export const getTickets = async (): Promise<SupportTicket[]> => {
  const data = await authenticatedFetch(`${API_URL}/support/my-tickets`);
  return data;
};

export const createTicket = async (ticket: Partial<SupportTicket>): Promise<SupportTicket> => {
  const data = await fetch(`${API_URL}/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  });
  if (!data.ok) {
    throw new Error('Failed to create ticket');
  }
  const result = await data.json();
  return result.ticket;
};

export const updateTicketStatus = async (id: number, status: string): Promise<SupportTicket> => {
  const data = await authenticatedFetch(`${API_URL}/support/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  return data.ticket;
};

// ==================== FAQs ====================

export const getFAQs = async (): Promise<FAQ[]> => {
  const data = await fetch(`${API_URL}/faqs`);
  if (!data.ok) {
    throw new Error('Failed to fetch FAQs');
  }
  return data.json();
};

export const createFAQ = async (faq: Partial<FAQ>): Promise<FAQ> => {
  const data = await authenticatedFetch(`${API_URL}/faqs`, {
    method: 'POST',
    body: JSON.stringify(faq),
  });
  return data.faq;
};

export const updateFAQ = async (id: number, updates: Partial<FAQ>): Promise<FAQ> => {
  const data = await authenticatedFetch(`${API_URL}/faqs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.faq;
};

export const deleteFAQ = async (id: number): Promise<void> => {
  await authenticatedFetch(`${API_URL}/faqs/${id}`, {
    method: 'DELETE',
  });
};

// ==================== POLICIES ====================

export const getPolicy = async (type: string): Promise<any> => {
  const data = await fetch(`${API_URL}/policies/${type}`);
  if (!data.ok) {
    throw new Error('Failed to fetch policy');
  }
  return data.json();
};

export const updatePolicy = async (type: string, title: string, content: string): Promise<any> => {
  const data = await authenticatedFetch(`${API_URL}/policies/${type}`, {
    method: 'PUT',
    body: JSON.stringify({ title, content }),
  });
  return data.policy;
};

// ==================== Additional Mock Functions (Future sprints) ====================

export const getWishlist = async (userId: number): Promise<WishlistItem[]> => [];
export const addToWishlist = async (userId: number, productId: number): Promise<WishlistItem> => ({} as WishlistItem);
export const removeFromWishlist = async (userId: number, productId: number): Promise<void> => {};

export const getReviews = async (productId: number): Promise<Review[]> => [];
export const getProductReviews = getReviews; // Alias
export const addReview = async (review: Partial<Review>): Promise<Review> => ({} as Review);

export const getDiscounts = async (): Promise<Discount[]> => [];
export const validateDiscount = async (code: string, amount: number): Promise<Discount> => ({} as Discount);
export const validateDiscountCode = validateDiscount; // Alias
export const createDiscount = async (discount: Partial<Discount>): Promise<Discount> => ({} as Discount);
export const deleteDiscount = async (id: number): Promise<void> => {};

export const getPromotions = async (): Promise<Promotion[]> => [];

export const getSuppliers = async (): Promise<Supplier[]> => [];
export const addSupplier = async (supplier: Partial<Supplier>): Promise<Supplier> => ({} as Supplier);
export const createSupplier = addSupplier; // Alias

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => [];
export const createPurchaseOrder = async (po: Partial<PurchaseOrder>): Promise<PurchaseOrder> => ({} as PurchaseOrder);
export const receivePurchaseOrder = async (id: number): Promise<PurchaseOrder> => ({} as PurchaseOrder);

export const getStockAdjustments = async (): Promise<StockAdjustment[]> => [];
export const createStockAdjustment = async (adjustment: Partial<StockAdjustment>): Promise<StockAdjustment> => ({} as StockAdjustment);
export const adjustStock = createStockAdjustment; // Alias

// Address aliases
export const getAddresses = getUserAddresses;
export const saveAddress = async (address: any): Promise<Address> => {
  if (address.id) {
    return updateAddress(address.id, address);
  } else {
    return addAddress(address);
  }
};

// Product aliases and extensions
export const createProduct = addProduct; // Alias
export const getRelatedProducts = async (productId: number, categoryId: number): Promise<Product[]> => {
  const products = await getProducts();
  return products.filter(p => p.category_id === categoryId && p.id !== productId).slice(0, 4);
};
export const recordProductView = async (productId: number): Promise<void> => {
  // Mock implementation - would track views in real app
  return Promise.resolve();
};

// User profile functions
export const updateProfile = async (userId: number, updates: Partial<User>): Promise<User> => {
  const data = await authenticatedFetch(`${API_URL}/users/profile`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.user;
};

// ==================== INVENTORY ====================

export const getInventory = async (): Promise<Product[]> => {
  const data = await authenticatedFetch(`${API_URL}/inventory`);
  return data.map((p: any) => ({
    ...p,
    partNumber: p.part_number,
    buyingPrice: p.buying_price,
    boxNumber: p.box_number,
  }));
};

export const getLowStockProducts = async (): Promise<{ count: number; products: Product[] }> => {
  const data = await authenticatedFetch(`${API_URL}/inventory/low-stock`);
  return {
    count: data.count,
    products: data.products.map((p: any) => ({
      ...p,
      partNumber: p.part_number,
      buyingPrice: p.buying_price,
      boxNumber: p.box_number,
    }))
  };
};

export const updateStock = async(productId: number, quantity: number, adjustmentType: 'set' | 'add' | 'subtract' = 'set'): Promise<Product> => {
  const data = await authenticatedFetch(`${API_URL}/inventory/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity, adjustment_type: adjustmentType }),
  });
  return {
    ...data.product,
    partNumber: data.product.part_number,
    buyingPrice: data.product.buying_price,
    boxNumber: data.product.box_number,
  };
};

export const bulkUpdateStock = async (updates: Array<{ product_id: number; quantity: number; adjustment_type: string }>): Promise<any> => {
  return await authenticatedFetch(`${API_URL}/inventory/bulk-update`, {
    method: 'POST',
    body: JSON.stringify({ updates }),
  });
};

// ==================== REPORTS ====================

export interface SalesReport {
  range: string;
  start_date: string | null;
  end_date: string | null;
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  total_discounts: number;
  online_orders: number;
  pos_orders: number;
  online_revenue: number;
  pos_revenue: number;
}

export interface ChannelReport {
  channel: string;
  order_count: number;
  total_revenue: number;
  avg_order_value: number;
}

export interface StockLevelsReport {
  overview: {
    total_products: number;
    total_stock: number;
    out_of_stock_count: number;
    low_stock_count: number;
    in_stock_count: number;
    total_inventory_value: number;
    potential_revenue: number;
  };
  by_category: Array<{
    category: string;
    product_count: number;
    total_stock: number;
    low_stock_items: number;
  }>;
}

export interface TopProduct {
  id: number;
  name: string;
  part_number: string;
  image: string;
  price: number;
  stock_quantity: number;
  category_name: string;
  order_count: number;
  total_sold: number;
  total_revenue: number;
}

export interface DailyTrend {
  date: string;
  order_count: number;
  revenue: number;
  online_orders: number;
  pos_orders: number;
}

export interface ProfitReport {
  total_orders: number;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  profit_margin: number;
  total_discounts: number;
  net_profit: number;
}

export const getSalesReport = async (range: 'daily' | 'weekly' | 'monthly' = 'daily', startDate?: string, endDate?: string): Promise<SalesReport> => {
  const params = new URLSearchParams({ range });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/sales?${params}`);
};

export const getSalesByChannel = async (startDate?: string, endDate?: string): Promise<ChannelReport[]> => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/sales-by-channel?${params}`);
};

export const getStockLevelsReport = async (): Promise<StockLevelsReport> => {
  return await authenticatedFetch(`${API_URL}/reports/stock-levels`);
};

export const getTopProducts = async (limit: number = 10, startDate?: string, endDate?: string): Promise<TopProduct[]> => {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/top-products?${params}`);
};

export const getDailySalesTrend = async (days: number = 30): Promise<DailyTrend[]> => {
  return await authenticatedFetch(`${API_URL}/reports/daily-trend?days=${days}`);
};

export const getProfitReport = async (startDate?: string, endDate?: string): Promise<ProfitReport> => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/profit?${params}`);
};
