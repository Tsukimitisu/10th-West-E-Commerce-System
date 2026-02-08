import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProducts, getCategories, createOrder, getOrderById } from '../../services/api';
import { Loader2, Search, Trash2, Plus, Minus, LogOut, RotateCcw, Monitor, ShoppingBag, Bike, Box, ArrowLeftCircle, Tag, Check } from 'lucide-react';
import PaymentModal from './PaymentModal';
import ReceiptModal from './ReceiptModal';
import { useSocketEvent } from '../../context/SocketContext';

const PosTerminal = () => {
    const navigate = useNavigate();
    // Data State
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    // Cart State (Local for POS)
    const [cartItems, setCartItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

    // Discount State
    const [posDiscount, setPosDiscount] = useState(null);
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [tempDiscount, setTempDiscount] = useState({ type: 'percent', value: '' });

    // Transaction State
    const [showPayment, setShowPayment] = useState(false);
    const [lastOrder, setLastOrder] = useState(null);

    // Return Mode State
    const [returnMode, setReturnMode] = useState(false);
    const [returnOrderId, setReturnOrderId] = useState('');
    const [returnOrder, setReturnOrder] = useState(null);
    const [returnItems, setReturnItems] = useState({});

    // Logout Confirmation
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    // User
    const userString = localStorage.getItem('shopCoreUser');
    const user = userString ? JSON.parse(userString) : null;

    const searchInputRef = useRef(null);

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

    const addToCart = (product) => {
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

    const updateQuantity = (productId, delta) => {
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

    const removeItem = (productId) => {
        setCartItems(current => current.filter(item => item.productId !== productId));
    };

    const clearCart = () => {
        setCartItems([]);
        setSearchTerm('');
        setPosDiscount(null);
    };

    // --- Return Logic ---
    const handleOrderLookup = async (e) => {
        e.preventDefault();
        try {
            const order = await getOrderById(Number(returnOrderId));
            if (order) setReturnOrder(order);
            else alert("Order not found");
        } catch (e) {
            alert("Error finding order");
        }
    };

    const handleReturnItemToggle = (productId, qty) => {
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

    const handleSearchKeyDown = (e) => {
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

    const handlePaymentComplete = async (method, tendered, change) => {
        try {
            const orderData = {
                user_id: undefined, // POS is usually anonymous or guest
                guest_info: { name: 'Walk-in Customer', email: 'pos@store.com' },
                items: cartItems,
                total_amount: total,
                shipping_address: 'In-Store Pickup',
                source: 'pos',
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
        } catch (e) {
            alert(`Transaction failed: ${e.message}`);
        }
    };

    const handleNewSale = () => {
        setLastOrder(null);
        clearCart();
    };

    const handleApplyDiscount = () => {
        setPosDiscount({
            type: tempDiscount.type,
            value: parseFloat(tempDiscount.value)
        });
        setShowDiscountModal(false);
    };

    const handleLogout = () => {
        if (cartItems.length > 0) {
            setShowLogoutConfirm(true);
        } else {
            navigate('/');
        }
    };

    const confirmLogout = () => {
        setShowLogoutConfirm(false);
        navigate('/');
    };

    if (loading && products.length === 0) return <div className="h-screen flex items-center justify-center bg-slate-100"><Loader2 className="animate-spin h-10 w-10 text-orange-600" /></div>;

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-100 overflow-hidden">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 h-16 flex items-center justify-between px-6 shadow-sm z-30 sticky top-0">
                <div className="flex items-center gap-3">
                    <div className="bg-red-600 p-2 rounded-lg shadow-lg shadow-red-200">
                        <Bike className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tighter text-gray-900 leading-none">10TH WEST</h1>
                        <p className="text-[10px] text-red-600 font-bold tracking-[0.2em] leading-none mt-1">POS TERMINAL</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    {!returnMode ? (
                        <button onClick={() => setReturnMode(true)} className="bg-gray-100 px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all">
                            Process Return
                        </button>
                    ) : (
                        <button onClick={() => setReturnMode(false)} className="bg-green-50 px-4 py-2 rounded-xl text-xs font-bold text-green-600 hover:bg-green-100 transition-all flex items-center shadow-sm border border-green-100">
                            <ArrowLeftCircle className="w-3 h-3 mr-1" /> Back to Sale
                        </button>
                    )}
                    <button onClick={fetchData} className="text-xs text-gray-400 hover:text-gray-900 font-medium flex items-center gap-1.5 transition-colors">
                        <RotateCcw size={14} className={loading ? 'animate-spin' : ''} /> Sync Stock
                    </button>
                    <div className="h-8 w-px bg-gray-200"></div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cashier</p>
                        <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                    </div>
                    <button onClick={handleLogout} className="bg-white p-2.5 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-600 border border-gray-100 hover:border-red-100 shadow-sm transition-all group">
                        <LogOut className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </header>

            {returnMode ? (
                // RETURN MODE UI
                <div className="flex-1 flex flex-col items-center justify-center p-10">
                    <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/50 max-w-2xl w-full">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="bg-red-50 p-3 rounded-2xl">
                                <RotateCcw className="w-8 h-8 text-red-600" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Return & Refund</h2>
                                <p className="text-gray-500 font-medium">Process order returns or exchanges</p>
                            </div>
                        </div>

                        <form onSubmit={handleOrderLookup} className="flex gap-3 mb-8">
                            <div className="flex-1 relative">
                                <Monitor className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Scan or Enter Order ID"
                                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-lg font-bold focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all shadow-inner"
                                    value={returnOrderId}
                                    onChange={(e) => setReturnOrderId(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className="bg-gray-900 text-white px-8 rounded-2xl font-bold hover:bg-gray-800 transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 shadow-lg">Lookup</button>
                        </form>

                        {returnOrder && (
                            <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex justify-between mb-6 pb-6 border-b border-gray-100">
                                    <div>
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Receipt ID</p>
                                        <p className="font-black text-gray-900 text-lg">#{returnOrder.id}</p>
                                        <p className="text-xs text-gray-500 font-medium mt-1">{new Date(returnOrder.created_at).toLocaleString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Paid</p>
                                        <p className="font-black text-red-600 text-2xl">₱{returnOrder.total_amount.toFixed(2)}</p>
                                        <div className="flex justify-end mt-1">
                                            <p className="text-[10px] font-black uppercase bg-green-100 text-green-600 px-2 py-0.5 rounded-full ring-1 ring-green-200 ring-inset">{returnOrder.status}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3 mb-8 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                    {returnOrder.items.map(item => (
                                        <div key={item.productId} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-50 hover:border-red-100 transition-all group cursor-pointer shadow-sm" onClick={() => handleReturnItemToggle(item.productId, item.quantity)}>
                                            <div className={`w-6 h-6 border-2 rounded-lg mr-3 flex items-center justify-center transition-all ${returnItems[item.productId] ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200' : 'border-gray-200 group-hover:border-red-200 bg-gray-50'}`}>
                                                {returnItems[item.productId] ? <Check className="w-4 h-4" /> : null}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-gray-900 text-sm">{item.product.name}</p>
                                                <p className="text-[10px] text-gray-400 font-bold tracking-widest">QTY: {item.quantity}</p>
                                            </div>
                                            <div className="font-black text-gray-900">₱{(item.product.price * item.quantity).toFixed(2)}</div>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={processReturn}
                                    className="w-full py-4 bg-gradient-to-r from-red-600 to-red-800 text-white font-black rounded-2xl hover:from-red-700 hover:to-red-900 shadow-xl shadow-red-200 hover:shadow-red-300 transition-all hover:-translate-y-1 active:translate-y-0"
                                >
                                    CONFIRM REFUND
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // SALE MODE UI (Existing)
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* LEFT: Product Browser */}
                    <div className="flex-1 flex flex-col border-r border-gray-200 bg-white min-w-0">
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
                                    className={`px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${selectedCategory === 'all' ? 'bg-gray-900 text-white border-gray-900 shadow-lg shadow-gray-200' : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300 hover:bg-gray-50'}`}
                                >
                                    All Parts
                                </button>
                                {categories.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => setSelectedCategory(c.id)}
                                        className={`px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${selectedCategory === c.id ? 'bg-gray-900 text-white border-gray-900 shadow-lg shadow-gray-200' : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300 hover:bg-gray-50'}`}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Product Grid */}
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                                {filteredProducts.map(product => {
                                    const isOutOfStock = product.stock_quantity === 0;
                                    return (
                                        <button
                                            key={product.id}
                                            onClick={() => addToCart(product)}
                                            disabled={isOutOfStock}
                                            className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-red-500 hover:shadow-xl hover:shadow-red-50 transition-all flex flex-col items-center text-center h-full group relative overflow-hidden ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}
                                        >
                                            <div className="w-full flex justify-between items-start mb-3">
                                                <span className="text-[9px] font-bold bg-gray-50 px-2 py-0.5 rounded-full text-gray-400 border border-gray-100">{product.partNumber}</span>
                                                {product.is_on_sale && <span className="text-[9px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded-full ring-1 ring-red-200 ring-inset">SALE</span>}
                                            </div>
                                            <div className="h-24 w-24 mb-4 rounded-xl overflow-hidden bg-gray-50/50 p-2 group-hover:bg-red-50/30 transition-colors">
                                                <img src={product.image} alt={product.name} className="h-full w-full object-contain group-hover:scale-110 transition-transform duration-500" />
                                            </div>
                                            <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-2 flex-1 group-hover:text-red-600 transition-colors text-left w-full leading-snug">{product.name}</h3>
                                            <div className="flex justify-between items-center w-full mt-auto pt-3 border-t border-gray-50">
                                                <span className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-md ${product.stock_quantity <= product.low_stock_threshold ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                    {isOutOfStock ? 'OUT' : `${product.stock_quantity} IN STOCK`}
                                                </span>
                                                <div className="flex flex-col items-end">
                                                    {product.is_on_sale ? (
                                                        <>
                                                            <span className="text-gray-400 line-through text-[10px] font-medium">₱{product.price.toFixed(2)}</span>
                                                            <span className="text-gray-900 font-black text-lg -mt-1">₱{product.sale_price?.toFixed(2)}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-gray-900 font-black text-lg">₱{product.price.toFixed(2)}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Subtle hover effect */}
                                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="bg-red-600 text-white p-1.5 rounded-full shadow-lg">
                                                    <Plus size={14} />
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Current Transaction */}
                    <div className="w-80 lg:w-96 flex-shrink-0 flex flex-col bg-white shadow-2xl border-l border-gray-200 z-20">
                        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
                            <div>
                                <h2 className="font-black text-xl text-gray-900 tracking-tight">Current Order</h2>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Transaction #{Math.floor(Math.random() * 10000)}</p>
                            </div>
                            <button onClick={clearCart} className="text-gray-400 hover:text-red-600 p-2.5 rounded-xl hover:bg-red-50 transition-all border border-gray-100 hover:border-red-100" title="Clear Cart">
                                <Trash2 className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Cart Items */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gradient-to-b from-gray-50/50 to-white">
                            {cartItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-4">
                                    <div className="bg-gray-50 p-6 rounded-3xl">
                                        <ShoppingBag className="h-16 w-16 opacity-20" />
                                    </div>
                                    <p className="font-bold text-sm">Scan or select items to begin</p>
                                </div>
                            ) : (
                                cartItems.map(item => (
                                    <div key={item.productId} className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-red-100 transition-all group">
                                        <div className="h-14 w-14 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 p-1 group-hover:bg-red-50 transition-colors">
                                            <img src={item.product.image} alt="" className="h-full w-full object-contain" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] text-slate-400 font-mono mb-0.5">{item.product.partNumber}</div>
                                            <h4 className="font-bold text-slate-900 text-sm truncate">{item.product.name}</h4>
                                            <div className="text-xs text-slate-500 font-medium">
                                                ₱{(item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price).toFixed(2)} / unit
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
                                                ₱{((item.product.is_on_sale && item.product.sale_price ? item.product.sale_price : item.product.price) * item.quantity).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Totals */}
                        <div className="p-6 bg-white border-t border-gray-100 shadow-[0_-8px_16px_-4px_rgba(0,0,0,0.05)]">
                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-gray-600 text-sm font-medium">
                                    <span>Subtotal</span>
                                    <span className="font-bold">₱{subtotal.toFixed(2)}</span>
                                </div>
                                {discountAmount > 0 && (
                                    <div className="flex justify-between text-green-600 text-sm font-bold bg-green-50 -mx-2 px-2 py-1.5 rounded-lg">
                                        <span className="flex items-center gap-1.5">
                                            <Tag className="w-3.5 h-3.5" />
                                            Discount
                                        </span>
                                        <span>-₱{discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-gray-600 text-sm font-medium">
                                    <span>Tax (8%)</span>
                                    <span className="font-bold">₱{tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-3xl font-black text-gray-900 pt-4 border-t-2 border-gray-100">
                                    <span>TOTAL</span>
                                    <span className="text-red-600">₱{total.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="flex gap-3 mb-4">
                                <button
                                    onClick={() => setShowDiscountModal(true)}
                                    className="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center gap-2 transition-all"
                                >
                                    <Tag className="w-4 h-4" /> Discount
                                </button>
                                {posDiscount && (
                                    <button
                                        onClick={() => setPosDiscount(null)}
                                        className="px-4 py-2.5 border-2 border-red-200 text-red-600 rounded-xl hover:bg-red-50 font-bold transition-all"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={() => setShowPayment(true)}
                                disabled={cartItems.length === 0}
                                className="w-full py-5 bg-gradient-to-r from-red-600 via-red-700 to-red-800 text-white rounded-2xl font-black text-xl shadow-2xl shadow-red-200 hover:shadow-red-300 hover:from-red-700 hover:via-red-800 hover:to-red-900 disabled:opacity-50 disabled:shadow-none transition-all hover:-translate-y-1 active:translate-y-0 flex justify-center items-center gap-3 relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                                <span className="relative">CHECKOUT</span>
                                <span className="relative font-black">₱{total.toFixed(2)}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Discount Modal */}
            {showDiscountModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl w-96 border border-gray-100 animate-in zoom-in-95 duration-200">
                        <h3 className="text-2xl font-black mb-6 text-gray-900">Apply Discount</h3>
                        <div className="flex gap-3 mb-6">
                            <button
                                onClick={() => setTempDiscount({ ...tempDiscount, type: 'percent' })}
                                className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${tempDiscount.type === 'percent' ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                            >
                                % Percent
                            </button>
                            <button
                                onClick={() => setTempDiscount({ ...tempDiscount, type: 'fixed' })}
                                className={`flex-1 py-3 rounded-xl border-2 font-bold transition-all ${tempDiscount.type === 'fixed' ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                            >
                                ₱ Fixed
                            </button>
                        </div>
                        <input
                            type="number"
                            placeholder="Enter discount value"
                            className="w-full border-2 border-gray-200 p-4 rounded-2xl mb-6 text-xl font-bold focus:border-red-500 focus:ring-4 focus:ring-red-500/10 outline-none transition-all"
                            value={tempDiscount.value}
                            onChange={(e) => setTempDiscount({ ...tempDiscount, value: e.target.value })}
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-2xl font-bold transition-all">Cancel</button>
                            <button onClick={handleApplyDiscount} className="flex-1 py-3 bg-red-600 text-white rounded-2xl hover:bg-red-700 font-bold shadow-lg hover:shadow-xl transition-all">Apply</button>
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

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl w-96 border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-red-50 p-3 rounded-2xl">
                                <LogOut className="w-8 h-8 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900">Sign Out?</h3>
                                <p className="text-gray-500 font-medium text-sm mt-1">You have items in the cart</p>
                            </div>
                        </div>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to sign out? Your current cart will be cleared.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-2xl font-bold transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmLogout}
                                className="flex-1 py-3 bg-red-600 text-white rounded-2xl hover:bg-red-700 font-bold shadow-lg hover:shadow-xl transition-all"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PosTerminal;