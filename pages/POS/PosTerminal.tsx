import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProducts, getCategories, createOrder, getOrderById } from '../../services/api';
import { Product, Category, CartItem, Order, User } from '../../types';
import { Loader2, Search, Trash2, Plus, Minus, LogOut, RotateCcw, Monitor, ShoppingBag, Bike, Box, ArrowLeftCircle, Tag } from 'lucide-react';
import PaymentModal from './PaymentModal';
import ReceiptModal from './ReceiptModal';
import { useSocketEvent } from '../../context/SocketContext';

const PosTerminal: React.FC = () => {
  const navigate = useNavigate();
  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Cart State (Local for POS)
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  
  // Discount State
  const [posDiscount, setPosDiscount] = useState<{ type: 'fixed' | 'percent', value: number } | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [tempDiscount, setTempDiscount] = useState({ type: 'percent', value: '' });

  // Transaction State
  const [showPayment, setShowPayment] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);

  // Return Mode State
  const [returnMode, setReturnMode] = useState(false);
  const [returnOrderId, setReturnOrderId] = useState('');
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [returnItems, setReturnItems] = useState<{ [key: number]: number }>({});

  // User
  const userString = localStorage.getItem('shopCoreUser');
  const user: User | null = userString ? JSON.parse(userString) : null;
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true); // Small loading state for refresh
      const [prodData, catData] = await Promise.all([getProducts(), getCategories()]);
      setProducts(prodData);
      setCategories(catData);
    } catch (error) {
      console.error("Failed to fetch POS data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time: refresh product grid when inventory or products change
  useSocketEvent('inventory:updated', fetchData);
  useSocketEvent('product:created', fetchData);
  useSocketEvent('product:updated', fetchData);
  useSocketEvent('product:deleted', fetchData);

  // --- Cart Logic ---

  const addToCart = (product: Product) => {
    if (product.stock_quantity === 0) return;

    setCartItems(current => {
      const existing = current.find(item => item.productId === product.id);
      
      // Check stock before adding
      if (existing && existing.quantity >= product.stock_quantity) {
          alert("Insufficient Stock!");
          return current;
      }

      if (existing) {
        return current.map(item => 
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...current, { productId: product.id, product, quantity: 1 }];
    });
    
    if (searchTerm) {
        setSearchTerm('');
        searchInputRef.current?.focus();
    }
  };

  const updateQuantity = (productId: number, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setCartItems(current => 
      current.map(item => {
        if (item.productId === productId) {
          const newQty = item.quantity + delta;
          if (newQty > product.stock_quantity) {
              return item; // Max stock reached
          }
          const validQty = Math.max(1, newQty);
          return { ...item, quantity: validQty };
        }
        return item;
      })
    );
  };

  const removeItem = (productId: number) => {
    setCartItems(current => current.filter(item => item.productId !== productId));
  };

  const clearCart = () => {
    setCartItems([]);
    setSearchTerm('');
    setPosDiscount(null);
  };

  // --- Return Logic ---
  const handleOrderLookup = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          const order = await getOrderById(Number(returnOrderId));
          if (order) setReturnOrder(order);
          else alert("Order not found");
      } catch (e) {
          alert("Error finding order");
      }
  };

  const handleReturnItemToggle = (productId: number, qty: number) => {
      setReturnItems(prev => {
          const current = prev[productId] || 0;
          const newVal = Math.max(0, Math.min(qty, current + 1));
          return { ...prev, [productId]: current === qty ? 0 : qty };
      });
  };

  const processReturn = () => {
      alert("Return Processed & Inventory Updated!");
      setReturnMode(false);
      setReturnOrder(null);
      setReturnItems({});
      setReturnOrderId('');
      fetchData(); // Sync stock
  };

  // --- Filtering ---
  
  const filteredProducts = products.filter(product => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = product.name.toLowerCase().includes(term) || 
                          product.partNumber.toLowerCase().includes(term) ||
                          (product.barcode && product.barcode.toLowerCase().includes(term)) ||
                          (product.sku && product.sku.toLowerCase().includes(term));
    const matchesCategory = selectedCategory === 'all' || product.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;

    const term = searchTerm.trim().toLowerCase();
    if (!term) return;

    const exactMatch = products.find(product => {
      const partNumber = product.partNumber?.toLowerCase();
      const barcode = product.barcode?.toLowerCase();
      const sku = product.sku?.toLowerCase();
      return term === partNumber || term === barcode || term === sku;
    });

    if (exactMatch) {
      e.preventDefault();
      addToCart(exactMatch);
      setSearchTerm('');
    }
  };

  // Calculate Totals
  const subtotal = cartItems.reduce((acc, item) => {
      const price = item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price;
      return acc + (price * item.quantity);
  }, 0);

  let discountAmount = 0;
  if (posDiscount) {
      if (posDiscount.type === 'percent') {
          discountAmount = (subtotal * posDiscount.value) / 100;
      } else {
          discountAmount = posDiscount.value;
      }
  }

  const tax = (subtotal - discountAmount) * 0.08; // Mock 8% tax
  const total = Math.max(0, subtotal - discountAmount + tax);

  // --- Payment & Order ---

  const handlePaymentComplete = async (method: 'cash' | 'card', tendered: number, change: number) => {
    try {
      const orderData = {
        user_id: undefined, // POS is usually anonymous or guest
        guest_info: { name: 'Walk-in Customer', email: 'pos@store.com' },
        items: cartItems,
        total_amount: total,
        shipping_address: 'In-Store Pickup',
        source: 'pos' as const,
        payment_method: method,
        amount_tendered: tendered,
        change_due: change,
        cashier_id: user?.id,
        discount_amount: discountAmount
      };
      
      const newOrder = await createOrder(orderData);
      setLastOrder(newOrder);
      setShowPayment(false);
      clearCart();
      // Refresh inventory after sale
      fetchData();
    } catch (e: any) {
      alert(`Transaction failed: ${e.message}`);
    }
  };

  const handleNewSale = () => {
    setLastOrder(null);
    clearCart();
  };

  const handleApplyDiscount = () => {
      setPosDiscount({ 
          type: tempDiscount.type as 'fixed' | 'percent', 
          value: parseFloat(tempDiscount.value) 
      });
      setShowDiscountModal(false);
  };

  const handleLogout = () => {
     navigate('/');
  };

  if (loading && products.length === 0) return <div className="h-screen flex items-center justify-center bg-slate-100"><Loader2 className="animate-spin h-10 w-10 text-orange-600" /></div>;

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="bg-slate-900 text-white h-16 flex items-center justify-between px-6 shadow-md z-10 border-b border-orange-600">
        <div className="flex items-center gap-3">
            <div className="bg-orange-600 p-1.5 rounded">
                <Bike className="h-6 w-6 text-white" />
            </div>
            <div>
                <h1 className="text-lg font-extrabold tracking-widest leading-none">10TH WEST</h1>
                <p className="text-xs text-orange-500 font-bold tracking-widest leading-none">POS TERMINAL</p>
            </div>
        </div>
        <div className="flex items-center gap-6">
            {!returnMode ? (
                <button onClick={() => setReturnMode(true)} className="bg-red-900 px-3 py-1 rounded text-xs font-bold hover:bg-red-800 transition-colors">
                    Process Return
                </button>
            ) : (
                <button onClick={() => setReturnMode(false)} className="bg-green-900 px-3 py-1 rounded text-xs font-bold hover:bg-green-800 transition-colors flex items-center">
                    <ArrowLeftCircle className="w-3 h-3 mr-1" /> Back to Sale
                </button>
            )}
            <button onClick={fetchData} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                <RotateCcw size={14} /> Sync Stock
            </button>
            <div className="text-right">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cashier</p>
                <p className="text-sm font-bold text-white">{user?.name}</p>
            </div>
            <button onClick={handleLogout} className="bg-slate-800 p-2 rounded-lg hover:bg-red-600 text-slate-400 hover:text-white transition-colors">
                <LogOut className="h-5 w-5" />
            </button>
        </div>
      </header>

      {returnMode ? (
          // RETURN MODE UI
          <div className="flex-1 flex flex-col items-center justify-center p-10">
              <div className="bg-white p-8 rounded-xl shadow-lg max-w-2xl w-full">
                  <h2 className="text-2xl font-bold mb-6 text-gray-800">Process Return / Exchange</h2>
                  <form onSubmit={handleOrderLookup} className="flex gap-4 mb-8">
                      <input 
                          type="text" 
                          placeholder="Scan or Enter Order ID" 
                          className="flex-1 border-2 border-gray-300 rounded-lg p-3 text-lg focus:border-orange-500 outline-none"
                          value={returnOrderId}
                          onChange={(e) => setReturnOrderId(e.target.value)}
                          autoFocus
                      />
                      <button type="submit" className="bg-slate-900 text-white px-6 rounded-lg font-bold hover:bg-slate-800">Lookup</button>
                  </form>

                  {returnOrder && (
                      <div className="border border-gray-200 rounded-lg p-4">
                          <div className="flex justify-between mb-4 pb-4 border-b">
                               <div>
                                   <p className="font-bold">Order #{returnOrder.id}</p>
                                   <p className="text-sm text-gray-500">{new Date(returnOrder.created_at).toLocaleString()}</p>
                               </div>
                               <div className="text-right">
                                   <p className="font-bold text-green-600">${returnOrder.total_amount.toFixed(2)}</p>
                                   <p className="text-xs uppercase bg-gray-100 px-2 rounded">{returnOrder.status}</p>
                               </div>
                          </div>
                          <div className="space-y-3 mb-6">
                              {returnOrder.items.map(item => (
                                  <div key={item.productId} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded cursor-pointer" onClick={() => handleReturnItemToggle(item.productId, item.quantity)}>
                                      <div className={`w-5 h-5 border-2 rounded mr-3 flex items-center justify-center ${returnItems[item.productId] ? 'bg-orange-600 border-orange-600 text-white' : 'border-gray-300'}`}>
                                          {returnItems[item.productId] ? <Plus className="w-3 h-3" /> : null}
                                      </div>
                                      <div className="flex-1">
                                          <p className="font-medium">{item.product.name}</p>
                                          <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                      </div>
                                      <div className="font-bold">${(item.product.price * item.quantity).toFixed(2)}</div>
                                  </div>
                              ))}
                          </div>
                          <button 
                            onClick={processReturn}
                            className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700"
                          >
                              Confirm Refund
                          </button>
                      </div>
                  )}
              </div>
          </div>
      ) : (
          // SALE MODE UI (Existing)
          <div className="flex-1 flex overflow-hidden">
            {/* LEFT: Product Browser */}
            <div className="flex-1 flex flex-col border-r border-slate-200 bg-white">
                {/* Search & Categories */}
                <div className="p-4 border-b border-slate-200 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                        <input 
                            ref={searchInputRef}
                            type="text" 
                            placeholder="Scan Part# or Search Name..." 
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <button 
                            onClick={() => setSelectedCategory('all')}
                            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${selectedCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            All Parts
                        </button>
                        {categories.map(c => (
                            <button 
                                key={c.id}
                                onClick={() => setSelectedCategory(c.id)}
                                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${selectedCategory === c.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                {c.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredProducts.map(product => {
                            const isOutOfStock = product.stock_quantity === 0;
                            return (
                            <button 
                                key={product.id}
                                onClick={() => addToCart(product)}
                                disabled={isOutOfStock}
                                className={`bg-white p-3 rounded-xl shadow-sm border border-slate-200 hover:border-orange-500 hover:shadow-md transition-all flex flex-col items-center text-center h-full group relative ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}
                            >
                                <div className="w-full flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-mono bg-slate-100 px-1 rounded text-slate-500">{product.partNumber}</span>
                                    {product.is_on_sale && <span className="text-[10px] font-bold bg-orange-100 text-orange-800 px-1 rounded">SALE</span>}
                                </div>
                                <div className="h-20 w-20 mb-2 rounded-lg overflow-hidden bg-white">
                                    <img src={product.image} alt={product.name} className="h-full w-full object-contain group-hover:scale-110 transition-transform" />
                                </div>
                                <h3 className="font-bold text-slate-900 text-sm line-clamp-2 mb-1 flex-1 group-hover:text-orange-600 text-left w-full">{product.name}</h3>
                                <div className="flex justify-between items-center w-full mt-2 border-t border-slate-100 pt-2">
                                    <span className={`text-xs font-bold ${product.stock_quantity <= product.low_stock_threshold ? 'text-red-500' : 'text-slate-500'}`}>
                                        {isOutOfStock ? '0 LEFT' : `${product.stock_quantity} Left`}
                                    </span>
                                    <div className="flex flex-col items-end">
                                        {product.is_on_sale ? (
                                            <>
                                                <span className="text-slate-400 line-through text-xs">${product.price.toFixed(2)}</span>
                                                <span className="text-orange-600 font-extrabold text-lg">${product.sale_price?.toFixed(2)}</span>
                                            </>
                                        ) : (
                                            <span className="text-slate-900 font-extrabold text-lg">${product.price.toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        )})}
                    </div>
                </div>
            </div>

            {/* RIGHT: Current Transaction */}
            <div className="w-[400px] flex flex-col bg-white shadow-2xl z-20">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h2 className="font-bold text-lg text-slate-800 uppercase tracking-wide">Current Order</h2>
                    <button onClick={clearCart} className="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors" title="Clear Cart">
                        <Trash2 className="h-5 w-5" />
                    </button>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                    {cartItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                            <ShoppingBag className="h-16 w-16 opacity-30" />
                            <p className="font-medium">Scan item to begin</p>
                        </div>
                    ) : (
                        cartItems.map(item => (
                            <div key={item.productId} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                <div className="h-12 w-12 rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
                                    <img src={item.product.image} alt="" className="h-full w-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] text-slate-400 font-mono mb-0.5">{item.product.partNumber}</div>
                                    <h4 className="font-bold text-slate-900 text-sm truncate">{item.product.name}</h4>
                                    <div className="text-xs text-slate-500 font-medium">
                                        ${(item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price).toFixed(2)} / unit
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-slate-100 rounded-lg">
                                        <button 
                                            onClick={() => item.quantity > 1 ? updateQuantity(item.productId, -1) : removeItem(item.productId)}
                                            className="p-1 hover:bg-slate-200 text-slate-600 rounded-l-lg"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="w-8 text-center text-sm font-bold text-slate-900">{item.quantity}</span>
                                        <button 
                                            onClick={() => updateQuantity(item.productId, 1)}
                                            className="p-1 hover:bg-slate-200 text-slate-600 rounded-r-lg"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <div className="font-bold text-slate-900 w-16 text-right text-sm">
                                        ${((item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price) * item.quantity).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Totals */}
                <div className="p-6 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <div className="space-y-2 mb-6">
                        <div className="flex justify-between text-slate-500 text-sm">
                            <span>Subtotal</span>
                            <span>${subtotal.toFixed(2)}</span>
                        </div>
                        {discountAmount > 0 && (
                            <div className="flex justify-between text-green-600 text-sm font-bold">
                                <span>Discount</span>
                                <span>-${discountAmount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-slate-500 text-sm">
                            <span>Tax (8%)</span>
                            <span>${tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-3xl font-extrabold text-slate-900 pt-4 border-t border-slate-100">
                            <span>Total</span>
                            <span>${total.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 mb-3">
                        <button 
                            onClick={() => setShowDiscountModal(true)}
                            className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center justify-center"
                        >
                            <Tag className="w-4 h-4 mr-2" /> Add Discount
                        </button>
                        {posDiscount && (
                            <button 
                                onClick={() => setPosDiscount(null)}
                                className="px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setShowPayment(true)}
                        disabled={cartItems.length === 0}
                        className="w-full py-4 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl font-bold text-lg shadow-lg hover:from-orange-700 hover:to-red-700 disabled:opacity-50 disabled:shadow-none transition-all flex justify-center items-center gap-2"
                    >
                        CHECKOUT ${total.toFixed(2)}
                    </button>
                </div>
            </div>
          </div>
      )}

      {/* Manual Discount Modal */}
      {showDiscountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white p-6 rounded-lg shadow-xl w-80">
                  <h3 className="text-lg font-bold mb-4">Manual Discount</h3>
                  <div className="flex gap-2 mb-4">
                      <button 
                        onClick={() => setTempDiscount({...tempDiscount, type: 'percent'})}
                        className={`flex-1 py-2 rounded border ${tempDiscount.type === 'percent' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-gray-300'}`}
                      >
                          % Percent
                      </button>
                      <button 
                        onClick={() => setTempDiscount({...tempDiscount, type: 'fixed'})}
                        className={`flex-1 py-2 rounded border ${tempDiscount.type === 'fixed' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-gray-300'}`}
                      >
                          $ Fixed
                      </button>
                  </div>
                  <input 
                    type="number" 
                    placeholder="Value" 
                    className="w-full border p-2 rounded mb-4 text-lg"
                    value={tempDiscount.value}
                    onChange={(e) => setTempDiscount({...tempDiscount, value: e.target.value})}
                    autoFocus
                  />
                  <div className="flex gap-2">
                      <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                      <button onClick={handleApplyDiscount} className="flex-1 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Apply</button>
                  </div>
              </div>
          </div>
      )}

      {/* Modals */}
      {showPayment && (
        <PaymentModal 
            total={total} 
            onComplete={handlePaymentComplete}
            onCancel={() => setShowPayment(false)}
        />
      )}

      {lastOrder && (
        <ReceiptModal 
            order={lastOrder} 
            onClose={() => setLastOrder(null)}
            onNewSale={handleNewSale}
        />
      )}
    </div>
  );
};

export default PosTerminal;