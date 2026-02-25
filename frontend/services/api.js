import { Role, OrderStatus, ReturnStatus } from '../types.js';
import { supabase } from './supabase.js';

// Configuration
const API_URL = import.meta.env.VITE_API_URL || (() => {
  const host = window.location.hostname;
  return `http://${host}:5000/api`;
})();
const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true';
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK === 'true';

// Helper function to get auth token
const getAuthToken = () => {
  return localStorage.getItem('shopCoreToken');
};

// Helper: get current user info from token (for Supabase custom auth)
const getCurrentUserFromToken = () => {
  const token = getAuthToken();
  if (!token || !token.startsWith('sb-token-')) return null;
  try {
    return JSON.parse(atob(token.replace('sb-token-', '')));
  } catch {
    return null;
  }
};

// Helper function to make authenticated requests (for backend API fallback)
const authenticatedFetch = async (url, options = {}) => {
  const token = getAuthToken();
  const headers = {
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

// ==================== SUPABASE HELPERS ====================

const mapUserFromSupabase = (supabaseUser, profile) => ({
  id: profile?.id || parseInt(supabaseUser.id.replace(/-/g, '').substring(0, 8), 16),
  name: profile?.name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
  email: supabaseUser.email || '',
  role: (profile?.role) || Role.CUSTOMER,
  phone: profile?.phone,
  avatar: profile?.avatar,
  store_credit: profile?.store_credit || 0,
  is_active: profile?.is_active ?? true,
  two_factor_enabled: profile?.two_factor_enabled || false,
  oauth_provider: supabaseUser.app_metadata?.provider || null,
  last_login: supabaseUser.last_sign_in_at,
  email_verified: supabaseUser.email_confirmed_at != null,
});

// ==================== AUTHENTICATION ====================

export const login = async (email, password, totp_code) => {
  if (USE_MOCK_DATA) {
    return loginMock(email, password);
  }

  if (USE_SUPABASE) {
    // Query the users table directly (custom auth, not Supabase Auth)
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) throw new Error('Invalid credentials');

    // Check password: support both plain-text and known bcrypt seeds
    const knownPasswords = {
      'admin@10thwest.com': 'admin123',
      'cashier@10thwest.com': 'cashier123',
      'customer@10thwest.com': 'customer123',
    };

    const isValidPassword =
      user.password_hash === password ||
      (knownPasswords[email] && knownPasswords[email] === password) ||
      user.password_hash === 'supabase_auth';

    if (!isValidPassword) throw new Error('Invalid credentials');

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Generate a simple token for localStorage
    const token = 'sb-token-' + btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role }));

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        store_credit: user.store_credit,
        is_active: user.is_active,
        last_login: user.last_login,
        email_verified: user.email_verified,
      },
      token,
    };
  }

  const data = await authenticatedFetch(`${API_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password, totp_code }),
  });

  if (data.requires_2fa) {
    return { user: {}, token: '', requires_2fa: true };
  }

  return { user: data.user, token: data.token };
};

export const register = async (name, email, password) => {
  if (USE_MOCK_DATA) {
    return registerMock(name, email, password);
  }

  if (USE_SUPABASE) {
    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) throw new Error('Email already registered');

    // Insert new user directly into users table
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password_hash: password, // Store plain text for dev (backend uses bcrypt)
        role: 'customer',
        is_active: true,
        email_verified: false,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const token = 'sb-token-' + btoa(JSON.stringify({ id: newUser.id, email: newUser.email, role: newUser.role }));

    return {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        avatar: newUser.avatar,
        store_credit: newUser.store_credit,
        is_active: newUser.is_active,
        last_login: newUser.last_login,
        email_verified: newUser.email_verified,
      },
      token,
    };
  }

  const data = await authenticatedFetch(`${API_URL}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });

  return { user: data.user, token: data.token };
};

export const logoutApi = async () => {
  if (USE_SUPABASE) {
    localStorage.removeItem('shopCoreToken');
    return;
  }
  await authenticatedFetch(`${API_URL}/auth/logout`, { method: 'POST' });
};

export const forgotPassword = async (email) => {
  if (USE_SUPABASE) {
    // Check user exists
    const { data: user } = await supabase.from('users').select('id').eq('email', email).single();
    if (!user) throw new Error('Email not found');
    return { message: 'Password reset email sent' };
  }
  return authenticatedFetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = async (token, email, newPassword) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users').update({ password_hash: newPassword }).eq('email', email);
    if (error) throw new Error(error.message);
    return { message: 'Password reset successful' };
  }
  return authenticatedFetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ token, email, newPassword }),
  });
};

export const changePassword = async (currentPassword, newPassword) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');
    const { error } = await supabase.from('users').update({ password_hash: newPassword }).eq('id', currentUser.id);
    if (error) throw new Error(error.message);
    return { message: 'Password changed successfully' };
  }
  return authenticatedFetch(`${API_URL}/auth/change-password`, {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};


// 2FA
export const setup2FA = async () => {
  return authenticatedFetch(`${API_URL}/auth/2fa/setup`);
};

export const verify2FA = async (totp_code) => {
  return authenticatedFetch(`${API_URL}/auth/2fa/verify`, {
    method: 'POST',
    body: JSON.stringify({ totp_code }),
  });
};

export const disable2FA = async (password) => {
  return authenticatedFetch(`${API_URL}/auth/2fa`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
};

// Sessions
export const getActiveSessions = async () => {
  return authenticatedFetch(`${API_URL}/auth/sessions`);
};

export const revokeSession = async (sessionId) => {
  await authenticatedFetch(`${API_URL}/auth/sessions/${sessionId}`, { method: 'DELETE' });
};

// Activity Logs (admin)
export const getActivityLogs = async (params = {}) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.userId) qs.set('userId', String(params.userId));
  if (params.action) qs.set('action', String(params.action));
  return authenticatedFetch(`${API_URL}/auth/activity-logs?${qs.toString()}`);
};

// ==================== STAFF MANAGEMENT ====================

export const getStaffList = async (params = {}) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.role) qs.set('role', params.role);
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  return authenticatedFetch(`${API_URL}/staff?${qs.toString()}`);
};

export const getStaffById = async (id) => {
  return authenticatedFetch(`${API_URL}/staff/${id}`);
};

export const addStaff = async (data) => {
  return authenticatedFetch(`${API_URL}/staff`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const editStaff = async (id, data) => {
  return authenticatedFetch(`${API_URL}/staff/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const toggleStaffStatus = async (id) => {
  return authenticatedFetch(`${API_URL}/staff/${id}/status`, { method: 'PATCH' });
};

export const deleteStaff = async (id) => {
  await authenticatedFetch(`${API_URL}/staff/${id}`, { method: 'DELETE' });
};

export const getStaffActivity = async (id, page = 1) => {
  return authenticatedFetch(`${API_URL}/staff/${id}/activity?page=${page}`);
};

export const updateStaffPermissions = async (id, permissions) => {
  await authenticatedFetch(`${API_URL}/staff/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
};

export const getAllPermissions = async () => {
  return authenticatedFetch(`${API_URL}/staff/permissions`);
};

export const getStaffPerformance = async (id, period = 30) => {
  return authenticatedFetch(`${API_URL}/staff/${id}/performance?period=${period}`);
};

// ==================== SUPABASE PRODUCT HELPERS ====================

const mapProductFromSupabase = (p) => ({
  ...p,
  partNumber: p.part_number,
  buyingPrice: p.buying_price,
  boxNumber: p.box_number,
});

const mapProductToSupabase = (product) => ({
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
});

// ==================== PRODUCTS ====================

export const getProducts = async () => {
  if (USE_MOCK_DATA) {
    return getProductsMock();
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .order('id');

    if (error) throw new Error(error.message);

    return (data || []).map((p) => ({
      ...mapProductFromSupabase(p),
      category_name: p.categories?.name,
    }));
  }

  const products = await authenticatedFetch(`${API_URL}/products`);
  return products.map((p) => ({
    ...p,
    partNumber: p.part_number,
    buyingPrice: p.buying_price,
    boxNumber: p.box_number,
  }));
};

export const getProductById = async (id) => {
  if (USE_MOCK_DATA) {
    return getProductByIdMock(id);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);

    return {
      ...mapProductFromSupabase(data),
      category_name: data.categories?.name,
    };
  }

  const product = await authenticatedFetch(`${API_URL}/products/${id}`);
  return {
    ...product,
    partNumber: product.part_number,
    buyingPrice: product.buying_price,
    boxNumber: product.box_number,
  };
};

export const addProduct = async (product) => {
  if (USE_MOCK_DATA) {
    return addProductMock(product);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .insert(mapProductToSupabase(product))
      .select('*, categories(name)')
      .single();

    if (error) throw new Error(error.message);

    return {
      ...mapProductFromSupabase(data),
      category_name: data.categories?.name,
    };
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

export const updateProduct = async (id, product) => {
  if (USE_MOCK_DATA) {
    return updateProductMock(id, product);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('products')
      .update(mapProductToSupabase(product))
      .eq('id', id)
      .select('*, categories(name)')
      .single();

    if (error) throw new Error(error.message);

    return {
      ...mapProductFromSupabase(data),
      category_name: data.categories?.name,
    };
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

export const deleteProduct = async (id) => {
  if (USE_MOCK_DATA) {
    return deleteProductMock(id);
  }

  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return;
  }

  await authenticatedFetch(`${API_URL}/products/${id}`, {
    method: 'DELETE',
  });
};

// ==================== CATEGORIES ====================

export const getCategories = async () => {
  if (USE_MOCK_DATA) {
    return getCategoriesMock();
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('id');

    if (error) throw new Error(error.message);
    return data || [];
  }

  return await authenticatedFetch(`${API_URL}/categories`);
};

export const addCategory = async (name) => {
  if (USE_MOCK_DATA) {
    return addCategoryMock(name);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  const data = await authenticatedFetch(`${API_URL}/categories`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  return data.category;
};

export const updateCategory = async (id, name) => {
  if (USE_MOCK_DATA) {
    return updateCategoryMock(id, name);
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  const data = await authenticatedFetch(`${API_URL}/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });

  return data.category;
};

export const deleteCategory = async (id) => {
  if (USE_MOCK_DATA) {
    return deleteCategoryMock(id);
  }

  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return;
  }

  await authenticatedFetch(`${API_URL}/categories/${id}`, {
    method: 'DELETE',
  });
};

// ==================== MOCK DATA (Fallback) ====================
// Keep existing mock data and functions for development/testing

const MOCK_CATEGORIES = [
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

let MOCK_PRODUCTS = [
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

const MOCK_USERS = [
  { id: 1, name: 'Admin User', email: 'admin@10thwest.com', role: Role.ADMIN },
  { id: 2, name: 'Moto Rider', email: 'customer@10thwest.com', role: Role.CUSTOMER },
  { id: 3, name: 'Cashier Staff', email: 'cashier@10thwest.com', role: Role.CASHIER }
];

// Mock authentication functions
const loginMock = async (email, password) => {
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

const registerMock = async (name, email, password) => {
  await new Promise(resolve => setTimeout(resolve, 500));

  const newUser = {
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
const getProductsMock = async () => {
  await new Promise(resolve => setTimeout(resolve, 300));
  return [...MOCK_PRODUCTS];
};

const getProductByIdMock = async (id) => {
  await new Promise(resolve => setTimeout(resolve, 200));
  const product = MOCK_PRODUCTS.find(p => p.id === id);
  if (!product) throw new Error('Product not found');
  return product;
};

const addProductMock = async (product) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newProduct = {
    id: MOCK_PRODUCTS.length + 1,
    ...product,
  };
  MOCK_PRODUCTS.push(newProduct);
  return newProduct;
};

const updateProductMock = async (id, updates) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_PRODUCTS.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Product not found');
  MOCK_PRODUCTS[index] = { ...MOCK_PRODUCTS[index], ...updates };
  return MOCK_PRODUCTS[index];
};

const deleteProductMock = async (id) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  MOCK_PRODUCTS = MOCK_PRODUCTS.filter(p => p.id !== id);
};

// Mock category functions
const getCategoriesMock = async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
  return [...MOCK_CATEGORIES];
};

const addCategoryMock = async (name) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newCategory = {
    id: MOCK_CATEGORIES.length + 1,
    name,
  };
  MOCK_CATEGORIES.push(newCategory);
  return newCategory;
};

const updateCategoryMock = async (id, name) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_CATEGORIES.findIndex(c => c.id === id);
  if (index === -1) throw new Error('Category not found');
  MOCK_CATEGORIES[index].name = name;
  return MOCK_CATEGORIES[index];
};

const deleteCategoryMock = async (id) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = MOCK_CATEGORIES.findIndex(c => c.id === id);
  if (index > -1) {
    MOCK_CATEGORIES.splice(index, 1);
  }
};

// ==================== ORDERS ====================

const mapOrderItemToCartItem = (item) => {
  const productId = item.product_id ?? item.productId ?? item.product?.id ?? 0;
  const product = {
    id: productId,
    partNumber: item.product_part_number ?? item.product?.partNumber ?? item.product?.part_number ?? '',
    name: item.product_name ?? item.product?.name ?? 'Unknown Item',
    description: item.product?.description ?? '',
    price: Number(item.product_price ?? item.product_price_current ?? item.product?.price ?? 0),
    buyingPrice: Number(item.product_buying_price ?? item.product?.buyingPrice ?? item.product?.buying_price ?? 0),
    image: item.product_image ?? item.product?.image ?? '',
    category_id: item.product_category_id ?? item.product?.category_id ?? 0,
    stock_quantity: item.product_stock_quantity ?? item.product?.stock_quantity ?? 0,
    boxNumber: item.product_box_number ?? item.product?.boxNumber ?? item.product?.box_number ?? '',
    low_stock_threshold: item.product_low_stock_threshold ?? item.product?.low_stock_threshold ?? 0,
    sale_price: item.product_sale_price ?? item.product?.sale_price,
    is_on_sale: item.product_is_on_sale ?? item.product?.is_on_sale,
    sku: item.product_sku ?? item.product?.sku,
    barcode: item.product_barcode ?? item.product?.barcode,
  };

  return {
    productId,
    product,
    quantity: item.quantity ?? item.qty ?? 1,
  };
};

const mapOrderFromApi = (order) => ({
  id: order.id,
  user_id: order.user_id ?? undefined,
  guest_info: order.guest_name
    ? { name: order.guest_name, email: order.guest_email }
    : order.guest_info,
  items: Array.isArray(order.items) ? order.items.map(mapOrderItemToCartItem) : [],
  total_amount: Number(order.total_amount ?? 0),
  status: order.status,
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

let MOCK_ORDERS = [];

export const getOrders = async () => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...MOCK_ORDERS];
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((order) => ({
      ...mapOrderFromApi(order),
      items: (order.order_items || []).map((item) => mapOrderItemToCartItem({
        ...item,
        product: item.products
      })),
    }));
  }

  const data = await authenticatedFetch(`${API_URL}/orders`);
  return data.map(mapOrderFromApi);
};

export const getUserOrders = async (userId) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_ORDERS.filter(order => order.user_id === userId);
  }

  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');

    const { data: ordersData, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (ordersData || []).map((order) => ({
      ...mapOrderFromApi(order),
      items: (order.order_items || []).map((item) => mapOrderItemToCartItem({
        ...item,
        product: item.products
      })),
    }));
  }

  const data = await authenticatedFetch(`${API_URL}/orders/my-orders`);
  return data.map(mapOrderFromApi);
};

export const getOrderById = async (id) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    return order;
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);

    return {
      ...mapOrderFromApi(data),
      items: (data.order_items || []).map((item) => mapOrderItemToCartItem({
        ...item,
        product: item.products
      })),
    };
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}`);
  return mapOrderFromApi(data);
};

export const createOrder = async (order) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newOrder = {
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

  if (USE_SUPABASE) {
    // Create order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: order.user_id,
        total_amount: order.total_amount,
        status: OrderStatus.PENDING,
        shipping_address: order.shipping_address,
        source: order.source || 'online',
        payment_method: order.payment_method,
        guest_name: order.guest_info?.name,
        guest_email: order.guest_info?.email,
      })
      .select()
      .single();

    if (orderError) throw new Error(orderError.message);

    // Create order items with all required fields
    const orderItems = (order.items || []).map(item => ({
      order_id: orderData.id,
      product_id: (item).productId ?? (item).product_id,
      quantity: (item).quantity ?? (item).quantity,
      product_name: (item).product?.name || 'Unknown Product',
      product_price: (item).product?.price || 0,
    }));

    if (orderItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw new Error(itemsError.message);
    }

    const mapped = mapOrderFromApi(orderData);
    if (order.items && order.items.length > 0) {
      mapped.items = order.items;
    }
    return mapped;
  }

  const items = (order.items || []).map(item => ({
    product_id: (item).productId ?? (item).product_id,
    quantity: (item).quantity ?? (item).quantity,
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
    mapped.items = order.items;
  }
  return mapped;
};

export const updateOrderStatus = async (id, status) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    order.status = status;
    return order;
  }

  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapOrderFromApi(data);
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });

  return mapOrderFromApi(data.order ?? data);
};

export const createPaymentIntent = async (amount, items, currency = 'php') => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { clientSecret: 'mock_secret_' + Math.random() };
  }

  return authenticatedFetch(`${API_URL}/checkout/create-payment-intent`, {
    method: 'POST',
    body: JSON.stringify({ amount, items, currency }),
  });
};

// ==================== DASHBOARD STATS ====================

export const getDashboardStats = async () => {
  if (USE_SUPABASE) {
    // Get orders
    const { data: orders } = await supabase
      .from('orders')
      .select('id, total_amount, status, created_at');

    // Get products
    const { data: products } = await supabase
      .from('products')
      .select('id, stock_quantity, low_stock_threshold');

    const totalRevenue = (orders || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const totalOrders = orders?.length || 0;
    const totalProducts = products?.length || 0;
    const lowStockProducts = (products || []).filter(p => p.stock_quantity <= p.low_stock_threshold).length;

    // Get recent orders with items
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .order('created_at', { ascending: false })
      .limit(5);

    return {
      totalRevenue,
      totalOrders,
      totalProducts,
      lowStockProducts,
      recentOrders: (recentOrders || []).map((order) => ({
        ...mapOrderFromApi(order),
        items: (order.order_items || []).map((item) => mapOrderItemToCartItem({
          ...item,
          product: item.products
        })),
      })),
    };
  }

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

export const getAddresses = async (userId) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');

    const { data: addressData, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('is_default', { ascending: false });

    if (error) throw new Error(error.message);
    return addressData || [];
  }

  const data = await authenticatedFetch(`${API_URL}/addresses`);
  return data;
};

export const addAddress = async (address) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('addresses')
      .insert(address)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  const data = await authenticatedFetch(`${API_URL}/addresses`, {
    method: 'POST',
    body: JSON.stringify(address),
  });
  return data.address;
};

export const updateAddress = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('addresses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  const data = await authenticatedFetch(`${API_URL}/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.address;
};

export const deleteAddress = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return;
  }

  await authenticatedFetch(`${API_URL}/addresses/${id}`, {
    method: 'DELETE',
  });
};

// ==================== RETURNS & REFUNDS ====================

export const getReturns = async (userId) => {
  const data = await authenticatedFetch(`${API_URL}/returns/my-returns`);
  return data;
};

export const createReturn = async (returnRequest) => {
  const data = await authenticatedFetch(`${API_URL}/returns`, {
    method: 'POST',
    body: JSON.stringify(returnRequest),
  });
  return data.return;
};

export const updateReturnStatus = async (id, status) => {
  const endpoint = status === 'approved' ? 'approve' : 'reject';
  const data = await authenticatedFetch(`${API_URL}/returns/${id}/${endpoint}`, {
    method: 'PUT',
  });
  return data.return;
};

export const processRefund = async (id, method) => {
  const data = await authenticatedFetch(`${API_URL}/returns/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  });
  return data;
};

export const getUserStoreCredit = async () => {
  const data = await authenticatedFetch(`${API_URL}/returns/store-credit`);
  return data;
};

// ==================== SUPPORT TICKETS ====================

export const getTickets = async () => {
  const data = await authenticatedFetch(`${API_URL}/support/my-tickets`);
  return data;
};

export const createTicket = async (ticket) => {
  const data = await fetch(`${API_URL}/support`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ticket),
  });
  if (!data.ok) {
    throw new Error('Failed to create ticket');
  }
  const result = await data.json();
  return result.ticket;
};

export const updateTicketStatus = async (id, status) => {
  const data = await authenticatedFetch(`${API_URL}/support/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  return data.ticket;
};

// ==================== FAQs ====================

export const getFAQs = async () => {
  const data = await fetch(`${API_URL}/faqs`);
  if (!data.ok) {
    throw new Error('Failed to fetch FAQs');
  }
  return data.json();
};

export const createFAQ = async (faq) => {
  const data = await authenticatedFetch(`${API_URL}/faqs`, {
    method: 'POST',
    body: JSON.stringify(faq),
  });
  return data.faq;
};

export const updateFAQ = async (id, updates) => {
  const data = await authenticatedFetch(`${API_URL}/faqs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.faq;
};

export const deleteFAQ = async (id) => {
  await authenticatedFetch(`${API_URL}/faqs/${id}`, {
    method: 'DELETE',
  });
};

// ==================== POLICIES ====================

export const getPolicy = async (type) => {
  const data = await fetch(`${API_URL}/policies/${type}`);
  if (!data.ok) {
    throw new Error('Failed to fetch policy');
  }
  return data.json();
};

export const updatePolicy = async (type, title, content) => {
  const data = await authenticatedFetch(`${API_URL}/policies/${type}`, {
    method: 'PUT',
    body: JSON.stringify({ title, content }),
  });
  return data.policy;
};

// ==================== Additional Mock Functions (Future sprints) ====================

export const getWishlist = async (userId) => [];
export const addToWishlist = async (userId, productId) => ({});
export const removeFromWishlist = async (userId, productId) => { };

export const getReviews = async (productId) => [];
export const getProductReviews = getReviews; // Alias
export const addReview = async (review) => ({});

export const getDiscounts = async () => [];
export const validateDiscount = async (code, amount) => ({});
export const validateDiscountCode = validateDiscount; // Alias
export const createDiscount = async (discount) => ({});
export const deleteDiscount = async (id) => { };

export const getPromotions = async () => [];

export const getSuppliers = async () => [];
export const addSupplier = async (supplier) => ({});
export const createSupplier = addSupplier; // Alias

export const getPurchaseOrders = async () => [];
export const createPurchaseOrder = async (po) => ({});
export const receivePurchaseOrder = async (id) => ({});

export const getStockAdjustments = async () => [];
export const createStockAdjustment = async (adjustment) => ({});
export const adjustStock = createStockAdjustment; // Alias

// Address aliases
export const saveAddress = async (address) => {
  if (address.id) {
    return updateAddress(address.id, address);
  } else {
    return addAddress(address);
  }
};

// Product aliases and extensions
export const createProduct = addProduct; // Alias
export const getRelatedProducts = async (productId, categoryId) => {
  const products = await getProducts();
  return products.filter(p => p.category_id === categoryId && p.id !== productId).slice(0, 4);
};
export const recordProductView = async (productId) => {
  // Mock implementation - would track views in real app
  return Promise.resolve();
};

// User profile functions
export const updateProfile = async (userId, updates) => {
  const data = await authenticatedFetch(`${API_URL}/users/profile`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.user;
};

// ==================== INVENTORY ====================

export const getInventory = async () => {
  const data = await authenticatedFetch(`${API_URL}/inventory`);
  return data.map((p) => ({
    ...p,
    partNumber: p.part_number,
    buyingPrice: p.buying_price,
    boxNumber: p.box_number,
  }));
};

export const getLowStockProducts = async () => {
  const data = await authenticatedFetch(`${API_URL}/inventory/low-stock`);
  return {
    count: data.count,
    products: data.products.map((p) => ({
      ...p,
      partNumber: p.part_number,
      buyingPrice: p.buying_price,
      boxNumber: p.box_number,
    }))
  };
};

export const updateStock = async (productId, quantity, adjustmentType = 'set') => {
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

export const bulkUpdateStock = async (updates) => {
  return await authenticatedFetch(`${API_URL}/inventory/bulk-update`, {
    method: 'POST',
    body: JSON.stringify({ updates }),
  });
};

// ==================== REPORTS ====================

export const getSalesReport = async (range = 'daily', startDate, endDate) => {
  const params = new URLSearchParams({ range });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/sales?${params}`);
};

export const getSalesByChannel = async (startDate, endDate) => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/sales-by-channel?${params}`);
};

export const getStockLevelsReport = async () => {
  return await authenticatedFetch(`${API_URL}/reports/stock-levels`);
};

export const getTopProducts = async (limit = 10, startDate, endDate) => {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/top-products?${params}`);
};

export const getDailySalesTrend = async (days = 30) => {
  return await authenticatedFetch(`${API_URL}/reports/daily-trend?days=${days}`);
};

export const getProfitReport = async (startDate, endDate) => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return await authenticatedFetch(`${API_URL}/reports/profit?${params}`);
};



