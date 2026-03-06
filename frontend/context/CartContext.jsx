import React, { createContext, useContext, useState, useEffect } from 'react';
import { validateDiscountCode } from '../services/api';

const API_URL = 'http://localhost:5000/api';

const CartContext = createContext(undefined);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const getToken = () => {
    return localStorage.getItem('shopCoreToken');
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
    if (!token) {
      // Load from localStorage if not logged in
      const savedCart = localStorage.getItem('shopCoreCart');
      setItems(savedCart ? JSON.parse(savedCart) : []);
      setInitialized(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cart`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const mappedItems = mapCartItemsFromBackend(data.items || []);
        setItems(mappedItems);
        // Save to localStorage as backup
        localStorage.setItem('shopCoreCart', JSON.stringify(mappedItems));
      } else {
        // Fall back to localStorage
        const savedCart = localStorage.getItem('shopCoreCart');
        setItems(savedCart ? JSON.parse(savedCart) : []);
      }
    } catch (err) {
      console.error('Error syncing cart:', err);
      const savedCart = localStorage.getItem('shopCoreCart');
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
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save to localStorage as backup
  useEffect(() => {
    if (initialized) {
      localStorage.setItem('shopCoreCart', JSON.stringify(items));
    }
  }, [items, initialized]);

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
    
    if (token) {
      // Add to backend if logged in
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/cart/add`, {
          method: 'POST',
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
    let added = false;
    setItems(currentItems => {
      const existingItem = currentItems.find(item => item.productId === product.id);
      const maxStock = resolveMaxStock(product?.stock_quantity != null ? product : existingItem?.product);
      const requestedQty = Number(quantity);
      if (!Number.isFinite(requestedQty) || requestedQty < 1) {
        setError('Invalid quantity.');
        return currentItems;
      }

      if (Number.isFinite(maxStock) && maxStock <= 0) {
        setError('This item is out of stock.');
        return currentItems;
      }

      if (existingItem) {
        const nextQuantity = existingItem.quantity + requestedQty;
        if (Number.isFinite(maxStock) && nextQuantity > maxStock) {
          setError(`Cannot exceed available stock (${maxStock}).`);
          return currentItems;
        }
        setError(null);
        added = true;
        return currentItems.map(item =>
          item.productId === product.id
            ? { ...item, quantity: nextQuantity }
            : item
        );
      }
      if (Number.isFinite(maxStock) && requestedQty > maxStock) {
        setError(`Cannot exceed available stock (${maxStock}).`);
        return currentItems;
      }
      setError(null);
      added = true;
      return [...currentItems, { productId: product.id, product, quantity: requestedQty }];
    });
    return added;
  };

  const removeFromCart = async (productId) => {
    const token = getToken();

    if (token) {
      try {
        setLoading(true);
        const targetItem = items.find((item) => item.productId === productId);
        const cartItemId = targetItem?.cartItemId ?? productId;
        const response = await fetch(`${API_URL}/cart/remove/${cartItemId}`, {
          method: 'DELETE',
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

    if (token) {
      try {
        setLoading(true);
        const cartItemId = targetItem?.cartItemId ?? productId;
        const response = await fetch(`${API_URL}/cart/update/${cartItemId}`, {
          method: 'PUT',
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

    if (token) {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/cart/clear`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          setItems([]);
          setDiscount(null);
          setError(null);
          localStorage.setItem('shopCoreCart', JSON.stringify([]));
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

  const clearCartLocal = () => {
    setItems([]);
    setDiscount(null);
    setError(null);
    localStorage.setItem('shopCoreCart', JSON.stringify([]));
  };

  // Calculations
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  
  const subtotal = items.reduce((sum, item) => {
      const price = (item.product.is_on_sale && item.product.sale_price) 
        ? item.product.sale_price 
        : item.product.price;
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
        addToCart, 
        removeFromCart, 
        updateQuantity, 
        clearCart, 
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
