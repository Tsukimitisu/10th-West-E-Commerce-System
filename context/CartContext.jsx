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
    const userString = localStorage.getItem('shopCoreUser');
    const user = userString ? JSON.parse(userString) : null;
    return user?.token || null;
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
        setItems(data.items || []);
        // Save to localStorage as backup
        localStorage.setItem('shopCoreCart', JSON.stringify(data.items || []));
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

  const addToCart = async (product, quantity = 1) => {
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
            quantity
          })
        });

        if (response.ok) {
          await syncCart();
        } else {
          throw new Error('Failed to add item to cart');
        }
      } catch (err) {
        console.error('Error adding to cart:', err);
        setError('Failed to add item to cart');
        // Fall back to local cart
        addToCartLocal(product, quantity);
      } finally {
        setLoading(false);
      }
    } else {
      // Use local storage if not logged in
      addToCartLocal(product, quantity);
    }
  };

  const addToCartLocal = (product, quantity) => {
    setItems(currentItems => {
      const existingItem = currentItems.find(item => item.productId === product.id);
      if (existingItem) {
        return currentItems.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...currentItems, { productId: product.id, product, quantity }];
    });
  };

  const removeFromCart = async (productId) => {
    const token = getToken();

    if (token) {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/cart/remove/${productId}`, {
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
    
    const token = getToken();

    if (token) {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/cart/update/${productId}`, {
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
    setItems(currentItems =>
      currentItems.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
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