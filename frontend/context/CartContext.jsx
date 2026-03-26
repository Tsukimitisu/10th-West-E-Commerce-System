import React, { createContext, useContext, useState, useEffect } from 'react';
import { validateDiscountCode } from '../services/api';
import { supabase } from '../services/supabase.js';

const API_URL = 'http://localhost:5000/api';
const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true';

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

  const getCurrentUserFromToken = () => {
    const token = localStorage.getItem('shopCoreToken');
    if (!token || !token.startsWith('sb-token-')) return null;
    try {
      return JSON.parse(atob(token.replace('sb-token-', '')));
    } catch {
      return null;
    }
  };

  const getCartKey = () => {
    const user = getCurrentUserFromToken();
    return user?.id ? `shopCoreCart_${user.id}` : 'shopCoreGuestCart';
  };

  const getSelectedKey = () => `${getCartKey()}_selected`;

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
    return rows.map((item) => ({
      cartItemId: item.id,
      productId: item.product_id ?? item.product?.id,
      quantity: item.quantity,
      product: {
        ...(item.product || {}),
        id: item.product_id ?? item.product?.id,
        image: item.product?.image || item.product?.image_url || '',
      },
    }));
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
          return;
        }

        const cartId = await getOrCreateSupabaseCartId(currentUser.id);
        if (!cartId) {
          setItems([]);
          setInitialized(true);
          return;
        }

        const { data: rows, error: itemsError } = await supabase
          .from('cart_items')
          .select('id, product_id, quantity, products(*)')
          .eq('cart_id', cartId);

        if (itemsError) throw new Error(itemsError.message);

        const mappedItems = mapCartItemsFromBackend((rows || []).map((item) => ({
          ...item,
          product: item.products
        })));

        setItems(mappedItems);
        sessionStorage.setItem(getCartKey(), JSON.stringify(mappedItems));
      } catch (err) {
        console.error('Error syncing cart (Supabase):', err);
        const savedCart = sessionStorage.getItem(getCartKey());
        setItems(savedCart ? JSON.parse(savedCart) : []);
      }
      setInitialized(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cart`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const mappedItems = mapCartItemsFromBackend(data.items || []);
        setItems(mappedItems);
        // Save to localStorage as backup
        sessionStorage.setItem(getCartKey(), JSON.stringify(mappedItems));
      } else {
        // Fall back to localStorage
        const savedCart = sessionStorage.getItem(getCartKey());
        setItems(savedCart ? JSON.parse(savedCart) : []);
      }
    } catch (err) {
      console.error('Error syncing cart:', err);
      const savedCart = sessionStorage.getItem(getCartKey());
      setItems(savedCart ? JSON.parse(savedCart) : []);
    }
    setInitialized(true);
  };

  // Initialize cart on mount and when user logs in
  useEffect(() => {
    syncCart();
  }, []);

  // Monitor localStorage for login changes
  useEffect(() => {
    const handleStorageChange = () => {
      syncCart();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth:changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth:changed', handleStorageChange);
    };
  }, []);

  // Save to localStorage as backup
  useEffect(() => {
    if (initialized) {
      sessionStorage.setItem(getCartKey(), JSON.stringify(items));
      // cleanup removed items
      const itemIds = new Set(items.map(i => i.productId));
      const cleanSelected = selectedItemIds.filter(id => itemIds.has(id));
      if (cleanSelected.length !== selectedItemIds.length) {
        setSelectedItemIds(cleanSelected);
      }
      sessionStorage.setItem(getSelectedKey(), JSON.stringify(cleanSelected));
    }
  }, [items, selectedItemIds, initialized]);

  // Load selection state once on mount / init
  useEffect(() => {
    if (initialized) {
      try {
        const saved = sessionStorage.getItem(getSelectedKey());
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && selectedItemIds.length === 0) {
            setSelectedItemIds(parsed);
          }
        }
      } catch (e) {
        console.error('Failed to load selected item ids', e);
      }
    }
  }, [initialized]);

  const resolveMaxStock = (product) => {
    const rawStock = Number(product?.stock_quantity);
    if (!Number.isFinite(rawStock)) return Infinity;
    return Math.max(0, rawStock);
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
      throw new Error("Guest Supabase fallback");
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
        const response = await fetch(`${API_URL}/cart/add`, {
          method: 'POST',
          credentials: 'include',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
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
      throw new Error("Guest Supabase fallback");
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
        const response = await fetch(`${API_URL}/cart/remove/${cartItemId}`, {
          method: 'DELETE',
          credentials: 'include',
        headers: {
            'Authorization': `Bearer ${token}`
          }
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
      throw new Error("Guest Supabase fallback");
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
        const response = await fetch(`${API_URL}/cart/update/${cartItemId}`, {
          method: 'PUT',
          credentials: 'include',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
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
      throw new Error("Guest Supabase fallback");
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
        const response = await fetch(`${API_URL}/cart/clear`, {
          method: 'DELETE',
          credentials: 'include',
        headers: {
            'Authorization': `Bearer ${token}`
          }
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
      throw new Error("Guest Supabase fallback");
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
        // Fallback for REST API - delete one by one
        await Promise.all(selectedItemIds.map(async id => {
          const targetItem = items.find((item) => item.productId === id);
          if (!targetItem) return;
          const cartItemId = targetItem?.cartItemId ?? id;
          return fetch(`${API_URL}/cart/remove/${cartItemId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        }));
        setItems(prev => prev.filter(item => !selectedItemIds.includes(item.productId)));
        setSelectedItemIds([]);
        setError(null);
        
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
    const currentLocal = JSON.parse(sessionStorage.getItem(getCartKey()) || '[]');
    sessionStorage.setItem(getCartKey(), JSON.stringify(currentLocal.filter(item => !selectedItemIds.includes(item.productId))));
  };

  const clearCartLocal = () => {
    setItems([]);
    setSelectedItemIds([]);
    setDiscount(null);
    setError(null);
    sessionStorage.setItem(getCartKey(), JSON.stringify([]));
  };

    const toggleSelection = (productId) => {
        setSelectedItemIds(prev => 
            prev.includes(productId) 
                ? prev.filter(id => id !== productId) 
                : [...prev, productId]
        );
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

