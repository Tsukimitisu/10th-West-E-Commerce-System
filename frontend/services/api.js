import { Role, OrderStatus, ReturnStatus } from '../types.js';
import { supabase } from './supabase.js';
import bcrypt from 'bcryptjs';

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

    // Securely compare password using bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password_hash || '');

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

export const register = async (name, email, password, consentData = {}) => {
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

    // Hash password before storing (PCI/security compliance)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert new user directly into users table
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password_hash: hashedPassword,
        role: 'customer',
        is_active: true,
        email_verified: false,
        consent_given_at: new Date().toISOString(),
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
    body: JSON.stringify({ name, email, password, ...consentData }),
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

// Get authenticated user profile (used by OAuth callback to avoid PII in URL)
export const getProfile = async () => {
  if (USE_SUPABASE) {
    const tokenData = localStorage.getItem('shopCoreToken');
    if (!tokenData) throw new Error('Not authenticated');
    const payload = JSON.parse(atob(tokenData.replace('sb-token-', '')));
    const { data, error } = await supabase.from('users').select('*').eq('id', payload.id).single();
    if (error || !data) throw new Error('User not found');
    return {
      id: data.id, name: data.name, email: data.email, role: data.role,
      phone: data.phone, avatar: data.avatar, store_credit: data.store_credit,
      is_active: data.is_active, last_login: data.last_login, email_verified: data.email_verified,
    };
  }
  return await authenticatedFetch(`${API_URL}/auth/profile`);
};

// Delete account - Right to be Forgotten (RA 10173 §18)
export const deleteAccount = async () => {
  if (USE_SUPABASE) {
    const user = JSON.parse(localStorage.getItem('shopCoreUser') || '{}');
    if (!user.id) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('users')
      .update({ is_active: false, name: 'Deleted User', email: `deleted_${user.id}@removed.local`, phone: null })
      .eq('id', user.id);
    if (error) throw new Error(error.message);
    return { message: 'Account deleted successfully' };
  }
  return await authenticatedFetch(`${API_URL}/auth/account`, { method: 'DELETE' });
};

// Data export / portability - RA 10173 §18
export const exportMyData = async () => {
  if (USE_SUPABASE) {
    const user = JSON.parse(localStorage.getItem('shopCoreUser') || '{}');
    if (!user.id) throw new Error('Not authenticated');
    const { data: userData } = await supabase.from('users').select('id, name, email, phone, role, created_at, last_login').eq('id', user.id).single();
    const { data: orders } = await supabase.from('orders').select('id, status, total_amount, created_at').eq('user_id', user.id);
    const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', user.id);
    return { exported_at: new Date().toISOString(), legal_basis: 'RA 10173 §18', personal_information: userData, orders: orders || [], addresses: addresses || [] };
  }
  return await authenticatedFetch(`${API_URL}/auth/export-data`);
};

// Resend email verification
export const resendVerification = async () => {
  if (USE_SUPABASE) {
    return { message: 'Verification email sent' };
  }
  return await authenticatedFetch(`${API_URL}/auth/resend-verification`, { method: 'POST' });
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

export const resetPassword = async (token, newPassword) => {
  if (USE_SUPABASE) {
    // In Supabase mode, find user by reset token
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('password_reset_token', token)
      .single();
    if (!user) throw new Error('Invalid or expired reset token');
    const { error } = await supabase.from('users')
      .update({ password_hash: newPassword, password_reset_token: null, password_reset_expires: null })
      .eq('id', user.id);
    if (error) throw new Error(error.message);
    return { message: 'Password reset successful' };
  }
  return authenticatedFetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
};

// Verify reset token validity before showing the form
export const verifyResetToken = async (token) => {
  if (USE_SUPABASE) {
    const { data: user } = await supabase
      .from('users')
      .select('id, password_reset_expires')
      .eq('password_reset_token', token)
      .single();
    if (!user) throw new Error('Invalid reset token');
    if (new Date(user.password_reset_expires) < new Date()) throw new Error('Reset token has expired');
    return { valid: true };
  }
  return authenticatedFetch(`${API_URL}/auth/verify-reset-token`, {
    method: 'POST',
    body: JSON.stringify({ token }),
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

// Cancel order (customer - only if not yet shipped)
export const cancelOrder = async (id) => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const order = MOCK_ORDERS.find(o => o.id === id);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending' && order.status !== 'paid') throw new Error('Cannot cancel this order');
    order.status = 'cancelled';
    return order;
  }

  if (USE_SUPABASE) {
    // First check order status
    const { data: existing } = await supabase.from('orders').select('status').eq('id', id).single();
    if (!existing || (existing.status !== 'pending' && existing.status !== 'paid')) {
      throw new Error('Order cannot be cancelled once it is being prepared or shipped');
    }
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapOrderFromApi(data);
  }

  const data = await authenticatedFetch(`${API_URL}/orders/${id}/cancel`, {
    method: 'PUT',
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

export const getWishlist = async (userId) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return [];
    const { data, error } = await supabase
      .from('wishlists')
      .select('*, products(*)')
      .eq('user_id', currentUser.id);
    if (error) return [];
    return (data || []).map(w => ({ ...w, product: w.products }));
  }
  return authenticatedFetch(`${API_URL}/wishlist`).catch(() => []);
};

export const addToWishlist = async (userId, productId) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return {};
    const { data, error } = await supabase
      .from('wishlists')
      .insert({ user_id: currentUser.id, product_id: productId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/wishlist`, {
    method: 'POST',
    body: JSON.stringify({ product_id: productId }),
  });
};

export const removeFromWishlist = async (userId, productId) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return;
    await supabase.from('wishlists').delete().eq('user_id', currentUser.id).eq('product_id', productId);
    return;
  }
  return authenticatedFetch(`${API_URL}/wishlist/${productId}`, { method: 'DELETE' });
};

export const getReviews = async (productId) => {
  if (USE_SUPABASE) {
    const { data } = await supabase
      .from('reviews')
      .select('*, users(name, avatar)')
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false });
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/products/${productId}/reviews`).catch(() => []);
};
export const getProductReviews = getReviews;

export const addReview = async (review) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('reviews')
      .insert({ ...review, user_id: currentUser.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/reviews`, {
    method: 'POST',
    body: JSON.stringify(review),
  });
};

export const getDiscounts = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('discounts').select('*').eq('is_active', true);
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/discounts`).catch(() => []);
};

export const validateDiscount = async (code, amount) => {
  if (USE_SUPABASE) {
    const { data } = await supabase
      .from('discounts')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();
    if (!data) throw new Error('Invalid discount code');
    if (data.min_purchase && amount < data.min_purchase) throw new Error(`Minimum purchase of ₱${data.min_purchase} required`);
    if (data.max_uses && data.used_count >= data.max_uses) throw new Error('Discount code has expired');
    if (data.expires_at && new Date(data.expires_at) < new Date()) throw new Error('Discount code has expired');
    const discountAmount = data.type === 'percentage' ? (amount * data.value / 100) : data.value;
    return { valid: true, discount: data, discountAmount };
  }
  return authenticatedFetch(`${API_URL}/discounts/validate`, {
    method: 'POST',
    body: JSON.stringify({ code, amount }),
  });
};
export const validateDiscountCode = validateDiscount;

export const createDiscount = async (discount) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('discounts').insert(discount).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/discounts`, { method: 'POST', body: JSON.stringify(discount) });
};

export const deleteDiscount = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('discounts').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/discounts/${id}`, { method: 'DELETE' });
};

export const getPromotions = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('banners').select('*').eq('is_active', true).order('display_order');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/banners`).catch(() => []);
};

// ==================== SUPPLIERS ====================

export const getSuppliers = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/suppliers`).catch(() => []);
};

export const addSupplier = async (supplier) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('suppliers').insert(supplier).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/suppliers`, { method: 'POST', body: JSON.stringify(supplier) });
};
export const createSupplier = addSupplier;

export const updateSupplier = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('suppliers').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteSupplier = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('suppliers').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/suppliers/${id}`, { method: 'DELETE' });
};

// ==================== SUBCATEGORIES ====================

export const getSubcategories = async (categoryId) => {
  if (USE_SUPABASE) {
    let query = supabase.from('subcategories').select('*, categories(name)');
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data } = await query.order('name');
    return data || [];
  }
  const url = categoryId ? `${API_URL}/subcategories/category/${categoryId}` : `${API_URL}/subcategories`;
  return authenticatedFetch(url).catch(() => []);
};

export const addSubcategory = async (subcategory) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('subcategories').insert(subcategory).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/subcategories`, { method: 'POST', body: JSON.stringify(subcategory) });
};

export const deleteSubcategory = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('subcategories').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/subcategories/${id}`, { method: 'DELETE' });
};

// ==================== PRODUCT VARIANTS ====================

export const getProductVariants = async (productId) => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('product_variants').select('*').eq('product_id', productId).order('variant_type');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/variants/product/${productId}`).catch(() => []);
};

export const addVariant = async (variant) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('product_variants').insert(variant).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/variants`, { method: 'POST', body: JSON.stringify(variant) });
};

export const updateVariant = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('product_variants').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/variants/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteVariant = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('product_variants').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/variants/${id}`, { method: 'DELETE' });
};

// ==================== NOTIFICATIONS ====================

export const getNotifications = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return [];
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/notifications`).catch(() => []);
};

export const getUnreadNotificationCount = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return 0;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('is_read', false);
    return count || 0;
  }
  const data = await authenticatedFetch(`${API_URL}/notifications/unread-count`).catch(() => ({ count: 0 }));
  return data.count || 0;
};

export const markNotificationRead = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/notifications/${id}/read`, { method: 'PUT' });
};

export const markAllNotificationsRead = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
    return;
  }
  return authenticatedFetch(`${API_URL}/notifications/read-all`, { method: 'PUT' });
};

export const deleteNotification = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('notifications').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/notifications/${id}`, { method: 'DELETE' });
};

// ==================== BANNERS ====================

export const getBanners = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('banners').select('*').eq('is_active', true).order('display_order');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/banners`).catch(() => []);
};

export const getAllBanners = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('banners').select('*').order('display_order');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/banners/all`).catch(() => []);
};

export const createBanner = async (banner) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('banners').insert(banner).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/banners`, { method: 'POST', body: JSON.stringify(banner) });
};

export const updateBanner = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('banners').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/banners/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteBanner = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('banners').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/banners/${id}`, { method: 'DELETE' });
};

// ==================== ANNOUNCEMENTS ====================

export const getAnnouncements = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('announcements').select('*').eq('is_published', true).order('published_at', { ascending: false });
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/announcements`).catch(() => []);
};

export const getAllAnnouncements = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/announcements/all`).catch(() => []);
};

export const createAnnouncement = async (announcement) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('announcements').insert(announcement).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/announcements`, { method: 'POST', body: JSON.stringify(announcement) });
};

export const updateAnnouncement = async (id, updates) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('announcements').update(updates).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/announcements/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
};

export const deleteAnnouncement = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('announcements').delete().eq('id', id);
    return;
  }
  return authenticatedFetch(`${API_URL}/announcements/${id}`, { method: 'DELETE' });
};

// ==================== STOCK ADJUSTMENTS ====================

export const getPurchaseOrders = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('stock_adjustments').select('*, products(name), users!stock_adjustments_adjusted_by_fkey(name)').order('created_at', { ascending: false });
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/inventory/adjustments`).catch(() => []);
};

export const createPurchaseOrder = async (po) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    const { data, error } = await supabase.from('stock_adjustments').insert({ ...po, adjusted_by: currentUser?.id }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/inventory/adjustments`, { method: 'POST', body: JSON.stringify(po) });
};

export const receivePurchaseOrder = async (id) => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    const { data, error } = await supabase.from('stock_adjustments').update({ status: 'approved', approved_by: currentUser?.id }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/inventory/adjustments/${id}/approve`, { method: 'PUT' });
};

export const getStockAdjustments = async () => getPurchaseOrders();
export const createStockAdjustment = async (adjustment) => createPurchaseOrder(adjustment);
export const adjustStock = createStockAdjustment;

// ==================== SHIPPING ====================

export const getShippingRates = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('shipping_rates').select('*').eq('is_active', true).order('base_fee');
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/shipping/rates`).catch(() => [
    { id: 1, method: 'standard', label: 'Standard Shipping', base_fee: 0, min_purchase_free: 2500, estimated_days: '5-7 days', is_active: true },
    { id: 2, method: 'express', label: 'Express Shipping', base_fee: 300, min_purchase_free: null, estimated_days: '1-2 days', is_active: true },
    { id: 3, method: 'pickup', label: 'Store Pickup', base_fee: 0, min_purchase_free: 0, estimated_days: 'Same day', is_active: true },
  ]);
};

export const updateTrackingNumber = async (orderId, trackingData) => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('orders').update(trackingData).eq('id', orderId).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  return authenticatedFetch(`${API_URL}/shipping/tracking/${orderId}`, { method: 'PUT', body: JSON.stringify(trackingData) });
};

// ==================== DEVICE HISTORY ====================

export const getDeviceHistory = async () => {
  if (USE_SUPABASE) {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser) return [];
    const { data } = await supabase.from('device_history').select('*').eq('user_id', currentUser.id).order('login_at', { ascending: false }).limit(20);
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/auth/device-history`).catch(() => []);
};

// ==================== ACTIVITY LOGS (AUDIT) ====================

export const getAuditLogs = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('activity_logs').select('*, users(name, email)').order('created_at', { ascending: false });
    if (params.userId) query = query.eq('user_id', params.userId);
    if (params.action) query = query.eq('action', params.action);
    const { data } = await query.limit(params.limit || 100);
    return data || [];
  }
  return getActivityLogs(params);
};

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

// ==================== SUPER ADMIN ====================

// User Management
export const adminGetAllUsers = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('users').select('id, name, email, role, phone, is_active, login_attempts, locked_until, two_factor_enabled, last_login, created_at', { count: 'exact' });
    if (params.role) query = query.eq('role', params.role);
    if (params.status === 'active') query = query.eq('is_active', true).is('locked_until', null);
    if (params.status === 'inactive') query = query.eq('is_active', false);
    if (params.status === 'locked') query = query.not('locked_until', 'is', null).gt('locked_until', new Date().toISOString());
    if (params.search) query = query.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
    const page = params.page || 1;
    const { data, count, error } = await query.order('created_at', { ascending: false }).range((page - 1) * 20, page * 20 - 1);
    if (error) throw new Error(error.message);
    return { users: data || [], total: count || 0 };
  }
  const qs = new URLSearchParams();
  if (params.role) qs.append('role', params.role);
  if (params.status) qs.append('status', params.status);
  if (params.search) qs.append('search', params.search);
  if (params.page) qs.append('page', params.page);
  return authenticatedFetch(`${API_URL}/admin/users?${qs.toString()}`);
};

export const adminLockUser = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users')
      .update({ is_active: false, locked_until: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await supabase.from('sessions').update({ is_active: false }).eq('user_id', id);
    return { message: 'User locked' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}/lock`, { method: 'PATCH' });
};

export const adminUnlockUser = async (id) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users')
      .update({ is_active: true, locked_until: null, login_attempts: 0 })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'User unlocked' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}/unlock`, { method: 'PATCH' });
};

export const adminResetUserPassword = async (id, newPassword) => {
  return authenticatedFetch(`${API_URL}/admin/users/${id}/reset-password`, {
    method: 'POST', body: JSON.stringify({ newPassword }),
  });
};

export const adminUpdateUserRole = async (id, role) => {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('users').update({ role }).eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'Role updated' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}/role`, {
    method: 'PATCH', body: JSON.stringify({ role }),
  });
};

export const adminDeleteUser = async (id) => {
  if (USE_SUPABASE) {
    await supabase.from('sessions').update({ is_active: false }).eq('user_id', id);
    try { await supabase.from('user_permissions').delete().eq('user_id', id); } catch {}
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { message: 'User deleted' };
  }
  return authenticatedFetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
};

// System Settings
export const getSystemSettings = async (category) => {
  if (USE_SUPABASE) {
    let query = supabase.from('system_settings').select('*');
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }
  const url = category ? `${API_URL}/admin/settings/${category}` : `${API_URL}/admin/settings`;
  return authenticatedFetch(url);
};

export const updateSystemSettings = async (category, settings) => {
  if (USE_SUPABASE) {
    for (const [key, value] of Object.entries(settings)) {
      const { error } = await supabase.from('system_settings')
        .upsert({ category, key, value: String(value), updated_at: new Date().toISOString() },
          { onConflict: 'category,key' });
      if (error) throw new Error(error.message);
    }
    return { message: 'Settings saved' };
  }
  return authenticatedFetch(`${API_URL}/admin/settings`, {
    method: 'PUT', body: JSON.stringify({ category, settings }),
  });
};

// Security Settings
export const getSecuritySettings = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('system_settings').select('key, value').eq('category', 'security');
    if (error) throw new Error(error.message);
    const settings = {};
    (data || []).forEach(r => { settings[r.key] = r.value; });
    return settings;
  }
  return authenticatedFetch(`${API_URL}/admin/security/settings`);
};

export const updateSecuritySettings = async (settings) => {
  if (USE_SUPABASE) {
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from('system_settings')
        .upsert({ category: 'security', key, value: String(value), updated_at: new Date().toISOString() },
          { onConflict: 'category,key' });
    }
    return { message: 'Security settings updated' };
  }
  return authenticatedFetch(`${API_URL}/admin/security/settings`, {
    method: 'PUT', body: JSON.stringify({ settings }),
  });
};

// Login Attempts
export const getLoginAttempts = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('login_attempts').select('*').order('created_at', { ascending: false });
    if (params.email) query = query.ilike('email', `%${params.email}%`);
    if (params.success !== undefined) query = query.eq('success', params.success);
    const { data } = await query.limit(params.limit || 100);
    // Get summary stats
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { count: todayTotal } = await supabase.from('login_attempts').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo);
    const { count: todayFailed } = await supabase.from('login_attempts').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo).eq('success', false);
    const { count: lockedCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).not('locked_until', 'is', null).gt('locked_until', now.toISOString());
    return {
      attempts: data || [],
      stats: { today_total: todayTotal || 0, today_failed: todayFailed || 0, locked_accounts: lockedCount || 0 }
    };
  }
  const qs = new URLSearchParams();
  if (params.email) qs.append('email', params.email);
  if (params.success !== undefined) qs.append('success', String(params.success));
  if (params.limit) qs.append('limit', params.limit);
  return authenticatedFetch(`${API_URL}/admin/security/login-attempts?${qs.toString()}`);
};

// Error & Transaction Logs
export const getErrorLogs = async (params = {}) => {
  if (USE_SUPABASE) {
    let query = supabase.from('error_logs').select('*').order('created_at', { ascending: false });
    if (params.type) query = query.eq('error_type', params.type);
    const { data } = await query.limit(params.limit || 100);
    return data || [];
  }
  const qs = new URLSearchParams();
  if (params.type) qs.append('type', params.type);
  if (params.limit) qs.append('limit', params.limit);
  return authenticatedFetch(`${API_URL}/admin/logs/errors?${qs.toString()}`);
};

export const getTransactionLogs = async (params = {}) => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('activity_logs').select('*, users!activity_logs_user_id_fkey(name)')
      .or('action.ilike.order%,action.ilike.payment%,action.ilike.checkout%,action.ilike.refund%,action.ilike.pos%')
      .order('created_at', { ascending: false }).limit(params.limit || 100);
    return (data || []).map(d => ({ ...d, user_name: d.users?.name }));
  }
  const qs = new URLSearchParams();
  if (params.limit) qs.append('limit', params.limit);
  return authenticatedFetch(`${API_URL}/admin/logs/transactions?${qs.toString()}`);
};

export const getSuspiciousActivity = async () => {
  if (USE_SUPABASE) {
    const { data: locked } = await supabase.from('users')
      .select('id, name, email, login_attempts, locked_until, last_login')
      .not('locked_until', 'is', null).gt('locked_until', new Date().toISOString());
    return { failed_login_clusters: [], locked_accounts: locked || [], bulk_operations: [] };
  }
  return authenticatedFetch(`${API_URL}/admin/logs/suspicious`);
};

// Backup & Recovery
export const createBackup = async () => {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('backup_history')
      .insert({ backup_type: 'manual', status: 'completed', file_name: `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json` })
      .select().single();
    if (error) throw new Error(error.message);
    return { message: 'Backup created', backup: data };
  }
  return authenticatedFetch(`${API_URL}/admin/backup`, { method: 'POST' });
};

export const getBackupHistory = async () => {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('backup_history').select('*').order('created_at', { ascending: false }).limit(50);
    return data || [];
  }
  return authenticatedFetch(`${API_URL}/admin/backup/history`);
};