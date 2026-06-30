import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Loader2,
  Minus,
  PackageOpen,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  UserRound,
  Wifi,
  X,
} from 'lucide-react';
import {
  createPosOrder,
  getCategories,
  getPosCapabilities,
  getPosDailySummary,
  getPosOrders,
  getPosProducts,
  getPosReceipt,
  validatePosCart,
  voidPosOrder,
} from '../../services/api';
import { getCurrentAuthUser } from '../../services/authSession';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import BrandMark from '../../components/ui/BrandMark';
import EmptyState from '../../components/ui/EmptyState';
import PaymentModal from './PaymentModal';
import ReceiptModal from './ReceiptModal';

const FALLBACK_IMAGE = '/images/product-fallback.svg';
const formatCurrency = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value || 0));
const lineKey = (productId, variantId) => `${productId}:${variantId || 0}`;

const PosTerminal = () => {
  const navigate = useNavigate();
  const user = getCurrentAuthUser();
  const { connected } = useSocket();
  const searchRef = useRef(null);
  const idempotencyKeyRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [dailySummary, setDailySummary] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [pageError, setPageError] = useState('');

  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [cartError, setCartError] = useState('');
  const [promotionInput, setPromotionInput] = useState('');
  const [promotionCode, setPromotionCode] = useState('');

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [toast, setToast] = useState(null);

  const [recentOpen, setRecentOpen] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidProcessing, setVoidProcessing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const showToast = (type, message) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3200);
  };

  const loadCatalog = useCallback(async (term = debouncedSearch, selectedCategory = categoryId) => {
    try {
      setCatalogLoading(true);
      setPageError('');
      const rows = await getPosProducts({ search: term, categoryId: selectedCategory });
      setProducts(rows);
    } catch (error) {
      if (error.status === 403) setAccessDenied(true);
      else setPageError(error.message || 'Products could not be loaded.');
    } finally {
      setCatalogLoading(false);
    }
  }, [categoryId, debouncedSearch]);

  const loadSummary = useCallback(async () => {
    try {
      setDailySummary(await getPosDailySummary());
    } catch {
      // A summary failure should not block active selling.
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getCategories(), getPosCapabilities(), getPosDailySummary()])
      .then(([categoryRows, access, summary]) => {
        if (!active) return;
        setCategories(categoryRows || []);
        setCapabilities(access);
        setDailySummary(summary);
        return getPosProducts();
      })
      .then((rows) => {
        if (active && rows) setProducts(rows);
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 403) setAccessDenied(true);
        else setPageError(error.message || 'POS could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (loading || accessDenied) return;
    void loadCatalog(debouncedSearch, categoryId);
  }, [accessDenied, categoryId, debouncedSearch, loadCatalog, loading]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useSocketEvent('inventory:updated', () => {
    void loadCatalog();
  });
  useSocketEvent('product:updated', () => {
    void loadCatalog();
  });

  const addLine = (product, variant = null) => {
    const available = Number(variant?.available_stock ?? product.available_stock ?? 0);
    if (available <= 0) {
      showToast('error', 'This item is out of stock.');
      return;
    }
    const key = lineKey(product.id, variant?.id);
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing && existing.quantity >= available) {
        showToast('error', `Only ${available} available.`);
        return current;
      }
      if (existing) {
        return current.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, {
        key,
        product_id: product.id,
        variant_id: variant?.id || null,
        quantity: 1,
        available_stock: available,
        product,
        variant,
      }];
    });
    setSelectedProduct(null);
    searchRef.current?.focus();
  };

  const chooseProduct = (product) => {
    if (product.variants?.length) setSelectedProduct(product);
    else addLine(product);
  };

  const updateQuantity = (key, nextQuantity) => {
    setCart((current) => current.map((item) => {
      if (item.key !== key) return item;
      const quantity = Math.max(1, Math.min(item.available_stock, Number(nextQuantity) || 1));
      if (quantity !== Number(nextQuantity)) showToast('error', `Available stock: ${item.available_stock}`);
      return { ...item, quantity };
    }));
  };

  const removeLine = (key) => setCart((current) => current.filter((item) => item.key !== key));

  useEffect(() => {
    if (cart.length === 0) {
      setQuote(null);
      setCartError('');
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const result = await validatePosCart(cart, promotionCode);
        if (active) {
          setQuote(result);
          setCartError('');
        }
      } catch (error) {
        if (active) {
          setQuote(null);
          setCartError(error.message || 'Cart validation failed.');
        }
      } finally {
        if (active) setQuoteLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cart, promotionCode]);

  const applyPromotion = () => {
    const code = promotionInput.trim().toUpperCase();
    setPromotionCode(code);
    if (!code) setPromotionInput('');
  };

  const openPayment = () => {
    if (!quote?.valid || cartError || quoteLoading) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    setPaymentError('');
    setPaymentOpen(true);
  };

  const completeSale = async ({ paymentMethod, amountTendered, paymentReference }) => {
    setPaymentProcessing(true);
    setPaymentError('');
    try {
      const result = await createPosOrder({
        items: cart,
        paymentMethod,
        amountTendered,
        paymentReference,
        promotionCode,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setReceipt(result.receipt || result.order);
      setPaymentOpen(false);
      setCart([]);
      setPromotionCode('');
      setPromotionInput('');
      idempotencyKeyRef.current = null;
      await Promise.all([loadCatalog(), loadSummary()]);
    } catch (error) {
      setPaymentError(error.message || 'The sale could not be completed.');
      if (!['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'POS_ORDER_PROCESSING'].includes(error.code)) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
    } finally {
      setPaymentProcessing(false);
    }
  };

  const openRecentSales = async () => {
    setRecentOpen(true);
    setRecentLoading(true);
    try {
      const result = await getPosOrders({ limit: 20 });
      setRecentOrders(result.orders || []);
    } catch (error) {
      showToast('error', error.message || 'Recent sales could not be loaded.');
    } finally {
      setRecentLoading(false);
    }
  };

  const openReceipt = async (orderId) => {
    try {
      setReceipt(await getPosReceipt(orderId));
      setRecentOpen(false);
    } catch (error) {
      showToast('error', error.message || 'Receipt could not be loaded.');
    }
  };

  const confirmVoid = async () => {
    if (!voidTarget || voidReason.trim().length < 5) return;
    setVoidProcessing(true);
    try {
      await voidPosOrder(voidTarget.id, voidReason.trim());
      setRecentOrders((current) => current.map((order) => order.id === voidTarget.id ? { ...order, status: 'cancelled', payment_status: 'refunded', voided_at: new Date().toISOString() } : order));
      setVoidTarget(null);
      setVoidReason('');
      await Promise.all([loadCatalog(), loadSummary()]);
      showToast('success', 'Sale voided and stock restored.');
    } catch (error) {
      showToast('error', error.message || 'Sale could not be voided.');
    } finally {
      setVoidProcessing(false);
    }
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const displayTotal = quote?.total_amount ?? 0;

  const productPrice = (product, variant = null) => {
    const base = Number(product.is_on_sale && product.sale_price ? product.sale_price : product.price);
    return variant?.price != null ? Number(variant.price) : base + Number(variant?.price_adjustment || 0);
  };

  const productGrid = useMemo(() => products.map((product) => {
    const variantStock = product.variants?.reduce((sum, variant) => sum + Number(variant.available_stock || 0), 0);
    const available = product.variants?.length ? variantStock : Number(product.available_stock || 0);
    return (
      <button
        key={product.id}
        type="button"
        onClick={() => chooseProduct(product)}
        disabled={available <= 0}
        className="group flex min-h-[245px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-300 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-55"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <img src={product.image || FALLBACK_IMAGE} alt="" onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE; }} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.025]" />
          {product.variants?.length > 0 && <span className="absolute left-2 top-2 rounded-lg bg-slate-950/88 px-2 py-1 text-[10px] font-bold text-white">{product.variants.length} variants</span>}
          {available <= 0 && <span className="absolute inset-0 grid place-items-center bg-white/75 text-xs font-black text-red-700">OUT OF STOCK</span>}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-red-600">{product.category_name || 'Moto part'}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-950">{product.name}</h3>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{product.sku || product.part_number || 'No SKU'}</p>
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <strong className="text-sm text-slate-950">{formatCurrency(productPrice(product))}</strong>
            <span className={`text-[11px] font-semibold ${available > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{available} available</span>
          </div>
        </div>
      </button>
    );
  }), [products]);

  if (loading) {
    return <div className="grid h-screen place-items-center bg-slate-100"><div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-red-600" /><p className="mt-3 text-sm text-slate-600">Opening POS…</p></div></div>;
  }

  if (accessDenied) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <AlertCircle className="mx-auto text-red-600" size={36} />
          <h1 className="mt-4 font-display text-2xl font-bold text-slate-950">POS access is not enabled</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your account is signed in, but it does not have the POS permission. Ask an owner or administrator to update your role permissions.</p>
          <button onClick={() => navigate('/admin')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white"><ArrowLeft size={16} /> Back to dashboard</button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => navigate('/admin')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" aria-label="Back to dashboard"><ArrowLeft size={19} /></button>
          <BrandMark link={false} className="hidden sm:inline-flex" />
          <div className="border-l border-slate-200 pl-3">
            <p className="font-display text-sm font-bold">Point of Sale</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 size={12} /> {now.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}><Wifi size={12} /> {connected ? 'Live inventory' : 'Reconnecting'}</span>
          <button onClick={openRecentSales} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><History size={16} /><span className="hidden sm:inline">Recent sales</span></button>
          <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 lg:flex">
            <UserRound size={16} className="text-slate-500" />
            <div><p className="text-xs font-semibold">{user?.name || 'Cashier'}</p><p className="text-[10px] capitalize text-slate-500">{user?.role?.replace('_', ' ')}</p></div>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, SKU, barcode, part number…"
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
                  autoFocus
                />
                {catalogLoading && <Loader2 size={17} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-red-600" />}
              </div>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold focus:border-orange-500 focus:outline-none">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            {dailySummary && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                <span><strong className="text-slate-950">{dailySummary.transaction_count}</strong> sales today</span>
                <span><strong className="text-slate-950">{formatCurrency(dailySummary.gross_sales)}</strong> gross</span>
                <span><strong className="text-slate-950">{formatCurrency(dailySummary.cash_sales)}</strong> cash</span>
                <span><strong className="text-slate-950">{formatCurrency(dailySummary.gcash_sales)}</strong> GCash</span>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            {pageError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">{pageError}<button onClick={() => loadCatalog()} className="ml-2 font-bold underline">Try again</button></div>
            ) : products.length === 0 && !catalogLoading ? (
              <EmptyState icon={PackageOpen} title="No products found" description="Try another product name, SKU, barcode, or category." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{productGrid}</div>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center gap-2"><ShoppingCart size={19} /><h2 className="font-display text-base font-bold">Current sale</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{cartCount}</span></div>
            {cart.length > 0 && <button onClick={() => { setCart([]); setPromotionCode(''); setPromotionInput(''); }} className="text-xs font-semibold text-red-600 hover:underline">Clear</button>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {cart.length === 0 ? (
              <div className="grid h-full min-h-56 place-items-center text-center">
                <div><ShoppingCart className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm font-semibold text-slate-700">Cart is empty</p><p className="mt-1 text-xs text-slate-500">Select a product to begin.</p></div>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex gap-3">
                      <img src={item.variant?.image_url || item.product.image || FALLBACK_IMAGE} alt="" className="h-12 w-12 rounded-lg bg-slate-100 object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.product.name}</p>
                        {item.variant && <p className="truncate text-xs text-slate-500">{item.variant.variant_type}: {item.variant.variant_value}</p>}
                        <p className="mt-1 text-xs font-bold">{formatCurrency(productPrice(item.product, item.variant))}</p>
                      </div>
                      <button onClick={() => removeLine(item.key)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.product.name}`}><Trash2 size={16} /></button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-slate-200">
                        <button onClick={() => updateQuantity(item.key, item.quantity - 1)} className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50" aria-label="Decrease quantity"><Minus size={14} /></button>
                        <input type="number" min="1" max={item.available_stock} value={item.quantity} onChange={(event) => updateQuantity(item.key, event.target.value)} className="h-9 w-11 border-x border-slate-200 text-center text-sm font-bold focus:outline-none" aria-label={`${item.product.name} quantity`} />
                        <button onClick={() => updateQuantity(item.key, item.quantity + 1)} className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50" aria-label="Increase quantity"><Plus size={14} /></button>
                      </div>
                      <strong className="text-sm">{formatCurrency(productPrice(item.product, item.variant) * item.quantity)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-4">
            {capabilities?.can_discount && (
              <div className="mb-3">
                <label htmlFor="promotion-code" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Tag size={13} /> Promotion code</label>
                <div className="flex gap-2">
                  <input id="promotion-code" value={promotionInput} onChange={(event) => setPromotionInput(event.target.value.toUpperCase())} placeholder="Enter code" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold focus:border-orange-500 focus:outline-none" />
                  <button onClick={applyPromotion} disabled={!cart.length} className="rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40">{promotionCode ? 'Update' : 'Apply'}</button>
                </div>
              </div>
            )}

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{quoteLoading ? 'Validating…' : formatCurrency(quote?.subtotal_amount || 0)}</dd></div>
              {Number(quote?.discount_amount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount {quote?.promotion?.code && `(${quote.promotion.code})`}</dt><dd>-{formatCurrency(quote.discount_amount)}</dd></div>}
              <div className="flex items-end justify-between border-t border-slate-200 pt-3"><dt className="font-display text-base font-bold">Total</dt><dd className="font-display text-2xl font-black">{formatCurrency(displayTotal)}</dd></div>
            </dl>
            {cartError && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{cartError}</div>}
            <button onClick={openPayment} disabled={!cart.length || !quote?.valid || quoteLoading || Boolean(cartError)} className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-base font-bold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40">
              <ReceiptText size={19} /> Pay {formatCurrency(displayTotal)}
            </button>
          </div>
        </aside>
      </main>

      {selectedProduct && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="variant-title">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div><p className="text-xs font-bold uppercase tracking-wider text-red-600">Choose variant</p><h2 id="variant-title" className="mt-1 font-display text-lg font-bold">{selectedProduct.name}</h2></div>
              <button onClick={() => setSelectedProduct(null)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close variant selector"><X size={19} /></button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {selectedProduct.variants.map((variant) => (
                <button key={variant.id} onClick={() => addLine(selectedProduct, variant)} disabled={variant.available_stock <= 0} className="flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 text-left hover:border-red-300 hover:bg-red-50/40 disabled:opacity-45">
                  <div><p className="text-sm font-semibold">{variant.variant_type}: {variant.variant_value}</p><p className="font-mono text-xs text-slate-500">{variant.sku || 'No SKU'}</p></div>
                  <div className="text-right"><p className="text-sm font-bold">{formatCurrency(productPrice(selectedProduct, variant))}</p><p className={`text-xs ${variant.available_stock > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{variant.available_stock} available</p></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {paymentOpen && <PaymentModal total={displayTotal} processing={paymentProcessing} error={paymentError} onComplete={completeSale} onCancel={() => !paymentProcessing && setPaymentOpen(false)} />}
      {receipt && <ReceiptModal order={receipt} onClose={() => setReceipt(null)} onNewSale={() => { setReceipt(null); searchRef.current?.focus(); }} />}

      {recentOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="recent-sales-title">
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div><p className="text-xs font-bold uppercase tracking-wider text-red-600">POS history</p><h2 id="recent-sales-title" className="mt-1 font-display text-xl font-bold">Recent sales</h2></div>
              <button onClick={() => setRecentOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close recent sales"><X size={19} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {recentLoading ? <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-red-600" /></div> : recentOrders.length === 0 ? <EmptyState icon={History} title="No POS sales yet" /> : (
                <div className="space-y-2">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-mono text-xs font-bold">{order.receipt_number || `Order #${order.id}`}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString('en-PH')} · {order.cashier_name}</p></div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${order.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{order.status === 'cancelled' ? 'Voided' : order.payment_method}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <strong>{formatCurrency(order.total_amount)}</strong>
                        <div className="flex gap-2">
                          {capabilities?.can_void && order.status === 'paid' && <button onClick={() => setVoidTarget(order)} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Void</button>}
                          <button onClick={() => openReceipt(order.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Receipt <ChevronRight size={13} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="void-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <AlertCircle className="text-red-600" size={28} />
            <h2 id="void-title" className="mt-3 font-display text-xl font-bold">Void {voidTarget.receipt_number}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">This cancels the sale, marks its payment refunded, restores inventory, and writes an audit record.</p>
            <label htmlFor="void-reason" className="mt-4 block text-sm font-semibold">Reason</label>
            <textarea id="void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={3} maxLength={500} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-red-500 focus:outline-none" placeholder="Required reason for voiding this sale" />
            <div className="mt-5 flex gap-3">
              <button onClick={() => { setVoidTarget(null); setVoidReason(''); }} disabled={voidProcessing} className="min-h-11 flex-1 rounded-xl border border-slate-300 text-sm font-semibold">Cancel</button>
              <button onClick={confirmVoid} disabled={voidReason.trim().length < 5 || voidProcessing} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-45">{voidProcessing && <Loader2 size={16} className="animate-spin" />} Void sale</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`} role="status">
          {toast.type === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />} {toast.message}
        </div>
      )}
    </div>
  );
};

export default PosTerminal;
