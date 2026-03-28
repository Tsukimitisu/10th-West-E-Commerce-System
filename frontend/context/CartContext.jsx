import React, { createContext, useContext, useState, useEffect } from 'react';
import { validateDiscountCode } from '../services/api';
import { supabase } from '../services/supabase.js';

const API_URL = 'http://localhost:5000/api';
const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true';
const GUEST_CART_KEY = 'shopCoreGuestCart';
const GUEST_SELECTED_KEY = `${GUEST_CART_KEY}_selected`;
const GUEST_CHECKOUT_SELECTION_KEY = `${GUEST_CART_KEY}_checkout_selection`;

const CartContext = createContext(undefined);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  const [discount, setDiscount] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const getToken = () => {
    return localStorage.getItem('shopCoreToken');
  };

  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem('shopCoreUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const decodeJwtPayload = (token) => {
    try {
      const [, payload] = token.split('.');
      if (!payload) return null;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  };

  const getCurrentUserFromToken = () => {
    const token = localStorage.getItem('shopCoreToken');
    if (!token) return null;
    if (token.startsWith('sb-token-')) {
      try {
        return JSON.parse(atob(token.replace('sb-token-', '')));
      } catch {
        return null;
      }
    }
    return decodeJwtPayload(token);
  };

  const getCurrentUser = () => {
    return getStoredUser() || getCurrentUserFromToken();
  };

  const getCartKey = () => {
    const user = getCurrentUser();
    return user?.id ? `shopCoreCart_${user.id}` : GUEST_CART_KEY;
  };

  const getSelectedKey = () => `${getCartKey()}_selected`;
  const getCheckoutSelectionKey = () => `${getCartKey()}_checkout_selection`;
  const [cartScopeKey, setCartScopeKey] = useState(getCartKey());

  const getOrCreateSupabaseCartId = async (userId) => {
    if (!supabase || !userId) return null;
    const { data: existingCart, error: findError } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw new Error(findError.message);
    if (existingCart?.id) return existingCart.id;

    const { data: newCart, error: insertError } = await supabase
      .from('carts')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (insertError) throw new Error(insertError.message);
    return newCart?.id ?? null;
  };

  const mapCartItemsFromBackend = (rows = []) => {
    const mapped = rows.map((item) => ({
      cartItemId: item.id,
      productId: item.product_id ?? item.product?.id,
      quantity: item.quantity,
      product: {
        ...(item.product || {}),
        id: item.product_id ?? item.product?.id,
        image: item.product?.image || item.product?.image_url || '',
      },
    }));
    return mapped.sort((a, b) => {
      const idA = a.cartItemId || a.productId;
      const idB = b.cartItemId || b.productId;
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    });
  };

  const getCsrfToken = async () => {
    const response = await fetch(`${API_URL}/csrf-token`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to initialize guest session');
    }
    const data = await response.json();
    if (!data?.csrfToken) {
      throw new Error('Missing CSRF token');
    }
    return data.csrfToken;
  };

  const buildRequestHeaders = async ({ includeJson = false } = {}) => {
    const token = getToken();
    const headers = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      headers['x-csrf-token'] = await getCsrfToken();
    }

    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  };

  const normalizeSelectionIds = (ids, sourceItems = items) => {
    const validIds = new Set(sourceItems.map((item) => item.productId));
    return Array.from(new Set(Array.isArray(ids) ? ids : [])).filter((id) => validIds.has(id));
  };

  const getCheckoutSelection = () => {
    try {
      const raw = sessionStorage.getItem(getCheckoutSelectionKey());
      if (!raw) return [];
      return normalizeSelectionIds(JSON.parse(raw));
    } catch {
      return [];
    }
  };

  const persistCheckoutSelection = (ids = selectedItemIds) => {
    const normalized = normalizeSelectionIds(ids);
    sessionStorage.setItem(getCheckoutSelectionKey(), JSON.stringify(normalized));
    return normalized;
  };

  const clearCheckoutSelection = () => {
    sessionStorage.removeItem(getCheckoutSelectionKey());
  };

  const getStoredCartItems = (storageKey) => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const clearGuestCartStorage = () => {
    sessionStorage.removeItem(GUEST_CART_KEY);
    sessionStorage.removeItem(GUEST_SELECTED_KEY);
    sessionStorage.removeItem(GUEST_CHECKOUT_SELECTION_KEY);
  };

  const normalizeGuestCartItems = (rawItems = []) => {
    const merged = new Map();

    for (const rawItem of Array.isArray(rawItems) ? rawItems : []) {
      const productId = Number(rawItem?.productId ?? rawItem?.product?.id);
      const quantity = Number(rawItem?.quantity || 0);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;

      const existing = merged.get(productId);
      if (existing) {
        existing.quantity += quantity;
        if (!existing.product && rawItem?.product) existing.product = rawItem.product;
      } else {
        merged.set(productId, {
          productId,
          quantity,
          product: rawItem?.product || null,
        });
      }
    }

    return Array.from(merged.values());
  };

  // Sync cart from backend when user logs in
  const syncCart = async () => {
    const token = getToken();

    if (USE_SUPABASE) {
      try {
        const currentUser = getCurrentUserFromToken();
        if (!currentUser?.id) {
          const savedCart = sessionStorage.getItem(getCartKey());
          setItems(savedCart ? JSON.parse(savedCart) : []);
          setInitialized(true);
          return true;
        }

        const cartId = await getOrCreateSupabaseCartId(currentUser.id);
        if (!cartId) {
          setItems([]);
          setInitialized(true);
          return true;
        }

        const { data: rows, error: itemsError } = await supabase
          .from('cart_items')
          .select('id, product_id, quantity, products(*)')
            .eq('cart_id', cartId)
            .order('id', { ascending: true });
        if (itemsError) throw new Error(itemsError.message);
        const mappedItems = mapCartItemsFromBackend((rows || []).map((item) => ({
          ...item,
          product: item.products
        })));

        setItems(mappedItems);
        sessionStorage.setItem(getCartKey(), JSON.stringify(mappedItems));
        setInitialized(true);
        return true;
      } catch (err) {
        console.error('Error syncing cart (Supabase):', err);
        const savedCart = sessionStorage.getItem(getCartKey());
        setItems(savedCart ? JSON.parse(savedCart) : []);
        setInitialized(true);
        return false;
      }
    }

    try {
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${API_URL}/cart`, {
        credentials: 'include',
        headers,
      });
      
      if (response.ok) {
        const data = await response.json();
        const mappedItems = mapCartItemsFromBackend(data.items || []);
        setItems(mappedItems);
        // Save to localStorage as backup
        sessionStorage.setItem(getCartKey(), JSON.stringify(mappedItems));
        setInitialized(true);
        return true;
      } else {
        // Fall back to localStorage
        const savedCart = sessionStorage.getItem(getCartKey());
        setItems(savedCart ? JSON.parse(savedCart) : []);
        setInitialized(true);
        return false;
      }
    } catch (err) {
      console.error('Error syncing cart:', err);
      const savedCart = sessionStorage.getItem(getCartKey());
      setItems(savedCart ? JSON.parse(savedCart) : []);
      setInitialized(true);
      return false;
    }
  };

  // Initialize cart on mount and when user logs in
  useEffect(() => {
    syncCart();
  }, [cartScopeKey]);

  // Monitor localStorage for login changes
  useEffect(() => {
    const handleStorageChange = async () => {
      setCartScopeKey(getCartKey());
      setSelectedItemIds([]);
      setHasLoadedSelection(false);
      const currentUser = getCurrentUser();

      if (currentUser?.id && USE_SUPABASE) {
        try {
          await mergeGuestCartIntoSupabaseCart();
        } catch (err) {
          console.error('Failed to merge guest cart after login:', err);
        }
      }

      const synced = await syncCart();
      if (currentUser?.id && synced) {
        clearGuestCartStorage();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth:changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth:changed', handleStorageChange);
    };
  }, []);

  // Load selection state once on mount / init
  const [hasLoadedSelection, setHasLoadedSelection] = useState(false);
  useEffect(() => {
    if (initialized && !hasLoadedSelection) {
      try {
        const saved = sessionStorage.getItem(getSelectedKey());
        if (saved) {
          const parsed = JSON.parse(saved);
          setSelectedItemIds(Array.isArray(parsed) ? parsed : []);
        } else {
          setSelectedItemIds([]);
        }
      } catch (e) {
        console.error('Failed to load selected item ids', e);
        setSelectedItemIds([]);
      }
      setHasLoadedSelection(true);
    }
  }, [initialized, hasLoadedSelection, cartScopeKey]);

  // Save to localStorage as backup
  useEffect(() => {
    if (initialized && hasLoadedSelection) {
      sessionStorage.setItem(getCartKey(), JSON.stringify(items));
      // cleanup removed items
      const itemIds = new Set(items.map(i => i.productId));
      const cleanSelected = selectedItemIds.filter(id => itemIds.has(id));
      if (cleanSelected.length !== selectedItemIds.length) {
        setSelectedItemIds(cleanSelected);
      }
      sessionStorage.setItem(getSelectedKey(), JSON.stringify(cleanSelected));
      const cleanCheckoutSelection = getCheckoutSelection().filter((id) => itemIds.has(id));
      sessionStorage.setItem(getCheckoutSelectionKey(), JSON.stringify(cleanCheckoutSelection));
    }
  }, [items, selectedItemIds, initialized, hasLoadedSelection, cartScopeKey]);

  const resolveMaxStock = (product) => {
    const rawStock = Number(product?.stock_quantity);
    if (!Number.isFinite(rawStock)) return Infinity;
    return Math.max(0, rawStock);
  };

  const mergeGuestCartIntoSupabaseCart = async () => {
    const currentUser = getCurrentUserFromToken();
    if (!currentUser?.id) return false;

    const guestItems = normalizeGuestCartItems(getStoredCartItems(GUEST_CART_KEY));
    if (guestItems.length === 0) return false;

    const cartId = await getOrCreateSupabaseCartId(currentUser.id);
    if (!cartId) return false;

    const { data: existingRows, error: existingError } = await supabase
      .from('cart_items')
      .select('id, product_id, quantity, products(*)')
      .eq('cart_id', cartId);

    if (existingError) throw new Error(existingError.message);

    const existingByProductId = new Map(
      (existingRows || []).map((row) => [
        Number(row.product_id),
        {
          id: row.id,
          quantity: Number(row.quantity || 0),
          product: row.products || null,
        },
      ])
    );

    for (const guestItem of guestItems) {
      const productId = Number(guestItem.productId);
      if (!productId) continue;

      const existingItem = existingByProductId.get(productId);
      const stockSource = existingItem?.product || guestItem.product;
      const maxStock = resolveMaxStock(stockSource);
      const desiredQuantity = (existingItem?.quantity || 0) + guestItem.quantity;
      const nextQuantity = Number.isFinite(maxStock)
        ? Math.max(0, Math.min(desiredQuantity, maxStock))
        : desiredQuantity;

      if (nextQuantity <= 0) continue;

      if (existingItem?.id) {
        const { error: updateError } = await supabase
          .from('cart_items')
          .update({ quantity: nextQuantity })
          .eq('id', existingItem.id);

        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase
          .from('cart_items')
          .insert({ cart_id: cartId, product_id: productId, quantity: nextQuantity });

        if (insertError) throw new Error(insertError.message);
      }
    }

    clearGuestCartStorage();
    return true;
  };

  const addToCart = async (product, quantity = 1) => {
    const requestedQty = Number(quantity);
    if (!Number.isFinite(requestedQty) || requestedQty < 1) {
      setError('Invalid quantity.');
      return false;
    }

    const existingItem = items.find((item) => item.productId === product.id);
    const maxStock = resolveMaxStock(product?.stock_quantity != null ? product : existingItem?.product);
    const currentQty = existingItem?.quantity || 0;
    const nextQty = currentQty + requestedQty;

    if (Number.isFinite(maxStock) && maxStock <= 0) {
      setError('This item is out of stock.');
      return false;
    }

    if (Number.isFinite(maxStock) && nextQty > maxStock) {
      setError(`Cannot exceed available stock (${maxStock}).`);
      return false;
    }

    setError(null);
    const token = getToken();
    if (USE_SUPABASE && !token) {
      return addToCartLocal(product, requestedQty);
    }
    if (true) {
      if (USE_SUPABASE) {
        try {
          setLoading(true);
          const currentUser = getCurrentUserFromToken();
          const cartId = await getOrCreateSupabaseCartId(currentUser?.id);
          if (!cartId) throw new Error('Unable to access cart');

          const { data: existingRows, error: existingError } = await supabase
            .from('cart_items')
            .select('id, quantity')
            .eq('cart_id', cartId)
            .eq('product_id', product.id)
            .limit(1)
            .maybeSingle();

          if (existingError) throw new Error(existingError.message);

          if (existingRows?.id) {
            const { error: updateError } = await supabase
              .from('cart_items')
              .update({ quantity: existingRows.quantity + requestedQty })
              .eq('id', existingRows.id);

            if (updateError) throw new Error(updateError.message);
          } else {
            const { error: insertError } = await supabase
              .from('cart_items')
              .insert({ cart_id: cartId, product_id: product.id, quantity: requestedQty });

            if (insertError) throw new Error(insertError.message);
          }

          await syncCart();
            setSelectedItemIds(prev => Array.from(new Set([...prev, product.id])));
            return true;
        } catch (err) {
          console.error('Error adding to cart (Supabase):', err);
          const fallbackAdded = addToCartLocal(product, requestedQty);
          if (!fallbackAdded) {
            setError('Failed to add item to cart');
          }
          return fallbackAdded;
        } finally {
          setLoading(false);
        }
      }

      // Add to backend if logged in
      try {
        setLoading(true);
        const headers = await buildRequestHeaders({ includeJson: true });
        const response = await fetch(`${API_URL}/cart/add`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            product_id: product.id,
            quantity: requestedQty
          })
        });

        if (response.ok) {
          await syncCart();
            setSelectedItemIds(prev => Array.from(new Set([...prev, product.id])));
            return true;
        } else {
          throw new Error('Failed to add item to cart');
        }
      } catch (err) {
        console.error('Error adding to cart:', err);
        // Fall back to local cart
        const fallbackAdded = addToCartLocal(product, requestedQty);
        if (!fallbackAdded) {
          setError('Failed to add item to cart');
        }
        return fallbackAdded;
      } finally {
        setLoading(false);
      }
    } else {
      // Use local storage if not logged in
      return addToCartLocal(product, requestedQty);
    }
  };

  const addToCartLocal = (product, quantity) => {
    const requestedQty = Number(quantity);
    if (!Number.isFinite(requestedQty) || requestedQty < 1) {
      setError('Invalid quantity.');
      return false;
    }

    const existingItem = items.find(item => item.productId === product.id);
    const maxStock = resolveMaxStock(product?.stock_quantity != null ? product : existingItem?.product);

    if (Number.isFinite(maxStock) && maxStock <= 0) {
      setError('This item is out of stock.');
      return false;
    }

    if (existingItem) {
      const nextQuantity = existingItem.quantity + requestedQty;
      if (Number.isFinite(maxStock) && nextQuantity > maxStock) {
        setError(`Cannot exceed available stock (${maxStock}).`);
        return false;
      }
    } else if (Number.isFinite(maxStock) && requestedQty > maxStock) {
      setError(`Cannot exceed available stock (${maxStock}).`);
      return false;
    }

    setError(null);

    setItems(currentItems => {
      const existing = currentItems.find(item => item.productId === product.id);
      if (existing) {
        return currentItems.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + requestedQty }
            : item
        );
      }
      return [...currentItems, { productId: product.id, product, quantity: requestedQty }];
    });
    setSelectedItemIds(prev => Array.from(new Set([...prev, product.id])));
    return true;
  };

  const removeFromCart = async (productId) => {
    const token = getToken();
    if (USE_SUPABASE && !token) {
      removeFromCartLocal(productId);
      return;
    }
    if (true) {
      if (USE_SUPABASE) {
        try {
          setLoading(true);
          const currentUser = getCurrentUserFromToken();
          const cartId = await getOrCreateSupabaseCartId(currentUser?.id);
          if (!cartId) throw new Error('Unable to access cart');

          const targetItem = items.find((item) => item.productId === productId);
          const cartItemId = targetItem?.cartItemId ?? null;

          if (cartItemId) {
            const { error: deleteError } = await supabase
              .from('cart_items')
              .delete()
              .eq('id', cartItemId);

            if (deleteError) throw new Error(deleteError.message);
          } else {
            const { error: deleteError } = await supabase
              .from('cart_items')
              .delete()
              .eq('cart_id', cartId)
              .eq('product_id', productId);

            if (deleteError) throw new Error(deleteError.message);
          }

          await syncCart();
        } catch (err) {
          console.error('Error removing from cart (Supabase):', err);
          setError('Failed to remove item');
          removeFromCartLocal(productId);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const targetItem = items.find((item) => item.productId === productId);
        const cartItemId = targetItem?.cartItemId ?? productId;
        const headers = await buildRequestHeaders();
        const response = await fetch(`${API_URL}/cart/remove/${cartItemId}`, {
          method: 'DELETE',
          credentials: 'include',
          headers,
        });

        if (response.ok) {
          await syncCart();
        } else {
          throw new Error('Failed to remove item');
        }
      } catch (err) {
        console.error('Error removing from cart:', err);
        setError('Failed to remove item');
        removeFromCartLocal(productId);
      } finally {
        setLoading(false);
      }
    } else {
      removeFromCartLocal(productId);
    }
  };

  const removeFromCartLocal = (productId) => {
    setItems(currentItems => currentItems.filter(item => item.productId !== productId));
  };

  const updateQuantity = async (productId, quantity) => {
    if (quantity < 1) return;

    const targetItem = items.find((item) => item.productId === productId);
    const maxStock = resolveMaxStock(targetItem?.product);
    if (targetItem && Number.isFinite(maxStock) && quantity > maxStock) {
      setError(`Cannot exceed available stock (${maxStock}).`);
      return;
    }
    setError(null);
    
    const token = getToken();
    if (USE_SUPABASE && !token) {
      updateQuantityLocal(productId, quantity);
      return;
    }
    if (true) {
      if (USE_SUPABASE) {
        try {
          setLoading(true);
          const currentUser = getCurrentUserFromToken();
          const cartId = await getOrCreateSupabaseCartId(currentUser?.id);
          if (!cartId) throw new Error('Unable to access cart');

          const targetItem = items.find((item) => item.productId === productId);
          const cartItemId = targetItem?.cartItemId ?? null;

          if (cartItemId) {
            const { error: updateError } = await supabase
              .from('cart_items')
              .update({ quantity })
              .eq('id', cartItemId);

            if (updateError) throw new Error(updateError.message);
          } else {
            const { error: updateError } = await supabase
              .from('cart_items')
              .update({ quantity })
              .eq('cart_id', cartId)
              .eq('product_id', productId);

            if (updateError) throw new Error(updateError.message);
          }

          await syncCart();
        } catch (err) {
          console.error('Error updating quantity (Supabase):', err);
          setError('Failed to update quantity');
          updateQuantityLocal(productId, quantity);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const cartItemId = targetItem?.cartItemId ?? productId;
        const headers = await buildRequestHeaders({ includeJson: true });
        const response = await fetch(`${API_URL}/cart/update/${cartItemId}`, {
          method: 'PUT',
          credentials: 'include',
          headers,
          body: JSON.stringify({ quantity })
        });

        if (response.ok) {
          await syncCart();
        } else {
          throw new Error('Failed to update quantity');
        }
      } catch (err) {
        console.error('Error updating quantity:', err);
        setError('Failed to update quantity');
        updateQuantityLocal(productId, quantity);
      } finally {
        setLoading(false);
      }
    } else {
      updateQuantityLocal(productId, quantity);
    }
  };

  const updateQuantityLocal = (productId, quantity) => {
    setItems(currentItems => {
      const target = currentItems.find((item) => item.productId === productId);
      const maxStock = resolveMaxStock(target?.product);
      if (target && Number.isFinite(maxStock) && quantity > maxStock) {
        setError(`Cannot exceed available stock (${maxStock}).`);
        return currentItems;
      }
      setError(null);

      return currentItems.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      );
    });
  };

  const clearCart = async () => {
    const token = getToken();
    if (USE_SUPABASE && !token) {
      clearCartLocal();
      return;
    }
    if (true) {
      if (USE_SUPABASE) {
        try {
          setLoading(true);
          const currentUser = getCurrentUserFromToken();
          const cartId = await getOrCreateSupabaseCartId(currentUser?.id);
          if (!cartId) throw new Error('Unable to access cart');

          const { error: deleteError } = await supabase
            .from('cart_items')
            .delete()
            .eq('cart_id', cartId);

          if (deleteError) throw new Error(deleteError.message);

          setItems([]);
          setSelectedItemIds([]);
          setDiscount(null);
          setError(null);
          sessionStorage.setItem(getCartKey(), JSON.stringify([]));
        } catch (err) {
          console.error('Error clearing cart (Supabase):', err);
          clearCartLocal();
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const headers = await buildRequestHeaders();
        const response = await fetch(`${API_URL}/cart/clear`, {
          method: 'DELETE',
          credentials: 'include',
          headers,
        });

        if (response.ok) {
          setItems([]);
          setSelectedItemIds([]);
          setDiscount(null);
          setError(null);
          sessionStorage.setItem(getCartKey(), JSON.stringify([]));
        }
      } catch (err) {
        console.error('Error clearing cart:', err);
        clearCartLocal();
      } finally {
        setLoading(false);
      }
    } else {
      clearCartLocal();
    }
  };

  const clearSelectedItems = async () => {
    if (selectedItemIds.length === 0) return;

    const token = getToken();
    if (USE_SUPABASE && !token) {
      clearSelectedItemsLocal();
      return;
    }
    if (true) {
      if (USE_SUPABASE) {
        try {
          setLoading(true);
          const currentUser = getCurrentUserFromToken();
          const cartId = await getOrCreateSupabaseCartId(currentUser?.id);
          if (!cartId) throw new Error('Unable to access cart');

          const { error: deleteError } = await supabase
            .from('cart_items')
            .delete()
            .eq('cart_id', cartId)
            .in('product_id', selectedItemIds);

          if (deleteError) throw new Error(deleteError.message);

          setItems(prev => prev.filter(item => !selectedItemIds.includes(item.productId)));
          setSelectedItemIds([]);
          setError(null);
          clearCheckoutSelection();
          
          // Update local storage
          const currentLocal = JSON.parse(sessionStorage.getItem(getCartKey()) || '[]');
          sessionStorage.setItem(getCartKey(), JSON.stringify(currentLocal.filter(item => !selectedItemIds.includes(item.productId))));
        } catch (err) {
          console.error('Error clearing selected items (Supabase):', err);
          clearSelectedItemsLocal();
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const headers = await buildRequestHeaders();
        // Fallback for REST API - delete one by one
        await Promise.all(selectedItemIds.map(async id => {
          const targetItem = items.find((item) => item.productId === id);
          if (!targetItem) return;
          const cartItemId = targetItem?.cartItemId ?? id;
          return fetch(`${API_URL}/cart/remove/${cartItemId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers,
          });
        }));
        setItems(prev => prev.filter(item => !selectedItemIds.includes(item.productId)));
        setSelectedItemIds([]);
        setError(null);
        clearCheckoutSelection();
        
        // Update local storage
        const currentLocal = JSON.parse(sessionStorage.getItem(getCartKey()) || '[]');
        sessionStorage.setItem(getCartKey(), JSON.stringify(currentLocal.filter(item => !selectedItemIds.includes(item.productId))));
      } catch (err) {
        console.error('Error clearing selected items:', err);
        clearSelectedItemsLocal();
      } finally {
        setLoading(false);
      }
    } else {
      clearSelectedItemsLocal();
    }
  };

  const clearSelectedItemsLocal = () => {
    setItems(prev => prev.filter(item => !selectedItemIds.includes(item.productId)));
    setSelectedItemIds([]);
    setError(null);
    clearCheckoutSelection();
    const currentLocal = JSON.parse(sessionStorage.getItem(getCartKey()) || '[]');
    sessionStorage.setItem(getCartKey(), JSON.stringify(currentLocal.filter(item => !selectedItemIds.includes(item.productId))));
  };

  const clearCartLocal = () => {
    setItems([]);
    setSelectedItemIds([]);
    setDiscount(null);
    setError(null);
    clearCheckoutSelection();
    sessionStorage.setItem(getCartKey(), JSON.stringify([]));
  };

    const toggleSelection = (productId) => {
        setSelectedItemIds(prev => normalizeSelectionIds(
            prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        ));
    };

    const toggleAllSelection = (selectAll) => {
        if (selectAll) {
            setSelectedItemIds(items.map(i => i.productId));
        } else {
            setSelectedItemIds([]);
        }
    };

    // Calculations
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);      
    
    const selectedItems = items.filter(i => selectedItemIds.includes(i.productId));
    const selectedItemCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0);

    const subtotal = selectedItems.reduce((sum, item) => {
        const price = item.product.is_on_sale ? item.product.sale_price : item.product.price;
        return sum + (price * item.quantity);
    }, 0);

  let discountAmount = 0;
  if (discount) {
      if (discount.type === 'percentage') {
          discountAmount = (subtotal * discount.value) / 100;
      } else {
          discountAmount = discount.value;
      }
      if (discountAmount > subtotal) discountAmount = subtotal;
  }

  const total = Math.max(0, subtotal - discountAmount);

  const applyDiscount = async (code) => {
      setError(null);
      try {
          const validDiscount = await validateDiscountCode(code, subtotal);
          setDiscount(validDiscount);
      } catch (e) {
          setError(e.message || "Failed to apply discount");
          setDiscount(null);
          throw e;
      }
  };

  const removeDiscount = () => {
      setDiscount(null);
      setError(null);
  };

  return (
    <CartContext.Provider value={{ 
        items,
        selectedItemIds,
        selectedItems,
        selectedItemCount,
        toggleSelection,
        toggleAllSelection,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        clearSelectedItems,
        itemCount,
        subtotal,
        total,
        discount,
        discountAmount,
        applyDiscount,
        removeDiscount,
        persistCheckoutSelection,
        getCheckoutSelection,
        clearCheckoutSelection,
        error,
        loading,
        syncCart
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

