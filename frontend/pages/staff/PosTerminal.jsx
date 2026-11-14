import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  Clock3,
  History,
  Loader2,
  Minus,
  PackageOpen,
  Plus,
  ReceiptText,
  ScanLine,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  UserRound,
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
import { useSocketEvent } from '../../context/SocketContext';
import useOfflinePos from '../../hooks/useOfflinePos.js';
import { allPosValues, commitOfflineCashSale, readPosValue, searchOfflineProducts, validateOfflineCart, updateOfflineSale } from '../../services/offlinePosDb.js';
import OfflinePosSetup from '../../components/staff/OfflinePosSetup.jsx';
import { lockLocalPos } from '../../services/offlinePosAccess.js';
import BrandMark from '../../components/ui/BrandMark';
import EmptyState from '../../components/ui/EmptyState';
import PaymentModal from './PaymentModal';
import ReceiptModal from './ReceiptModal';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import CameraScannerModal from '../../components/staff/CameraScannerModal.jsx';
import { roleLandingPath } from '../../utils/roleLanding.js';

const DESKTOP_QUERY = '(min-width: 1024px)';

const MAX_POS_QUANTITY = 100;
const MAX_POS_QUANTITY_MESSAGE = 'Maximum POS quantity per item is 100.';

const formatCurrency = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value || 0));
const lineKey = (productId, variantId) => `${productId}:${variantId || 0}`;

const PosTerminal = ({ userOverride, connection }) => {
  const navigate = useNavigate();
  const user = userOverride || getCurrentAuthUser();
  const online = connection?.online !== false;
  const offline = useOfflinePos({ online,user });
  const [setupOpen,setSetupOpen]=useState(false);
  const uncertainOnlineSale=useRef(false);
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
  const [scannerOpen, setScannerOpen] = useState(false);

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
  const [saleExpanded, setSaleExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const workspacePath = roleLandingPath(user?.role);
  const backPath = workspacePath && workspacePath !== '/pos' ? workspacePath : null;

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = (event) => setIsDesktop(event.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const showToast = (type, message) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3200);
  };

  const loadCatalog = useCallback(async (term = debouncedSearch, selectedCategory = categoryId) => {
    try {
      setCatalogLoading(true);
      setPageError('');
      const rows = await (online ? getPosProducts({ search: term, categoryId: selectedCategory }) : searchOfflineProducts({ search:term,categoryId:selectedCategory }));
      setProducts(rows);
    } catch (error) {
      if (error.status === 403) setAccessDenied(true);
      else setPageError(error.message || 'Products could not be loaded.');
    } finally {
      setCatalogLoading(false);
    }
  }, [categoryId, debouncedSearch,online]);

  const loadSummary = useCallback(async () => {
    if (!online) return;
    try {
      setDailySummary(await getPosDailySummary());
    } catch {
      // A summary failure should not block active selling.
    }
  }, [online]);

  useEffect(() => {
    let active = true;
    (online ? Promise.all([getCategories(), getPosCapabilities(), getPosDailySummary()]) : Promise.resolve([[],{can_access:true,can_discount:false,can_void:false},null]))
      .then(([categoryRows, access, summary]) => {
        if (!active) return;
        setCategories(categoryRows || []);
        setCapabilities(access);
        setDailySummary(summary);
        return online ? getPosProducts() : searchOfflineProducts();
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
  }, [online]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(()=>{
    if(online)return;
    let live=true;
    searchOfflineProducts().then(rows=>{if(live)setCart(current=>current.map(item=>{const product=rows.find(p=>p.id===item.product_id);const variant=product?.variants?.find(v=>v.id===item.variant_id);return product ? {...item,product,variant,available_stock:variant?.available_stock ?? product.available_stock} : item;}));});
    return()=>{live=false;};
  },[online]);

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
      if (existing && existing.quantity >= MAX_POS_QUANTITY) {
        showToast('error', MAX_POS_QUANTITY_MESSAGE);
        return current;
      }
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

  const handleCameraScan = async (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return;
    setSearch(value);
    setCatalogLoading(true);
    try {
      const rows = await (online ? getPosProducts({ search: value }) : searchOfflineProducts({ search:value }));
      const normalized = value.toLowerCase();
      let exactProduct = null;
      let exactVariant = null;

      for (const product of rows) {
        const productMatch = [product.barcode, product.sku, product.part_number]
          .some((candidate) => String(candidate || '').trim().toLowerCase() === normalized);
        const variant = product.variants?.find((candidate) => [candidate.barcode, candidate.sku, candidate.part_number]
          .some((field) => String(field || '').trim().toLowerCase() === normalized));
        if (variant) {
          exactProduct = product;
          exactVariant = variant;
          break;
        }
        if (productMatch) exactProduct = product;
      }

      if (exactProduct) {
        if (exactVariant) addLine(exactProduct, exactVariant);
        else chooseProduct(exactProduct);
        showToast('success', `${exactProduct.name} scanned.`);
        return;
      }
      setProducts(rows || []);
      if (rows?.length) showToast('success', 'Matching items found. Select the correct item.');
      else showToast('error', 'Item not found in inventory.');
    } catch (error) {
      showToast('error', error.message || 'Scanned item lookup failed.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const updateQuantity = (key, nextQuantity) => {
    setCart((current) => current.map((item) => {
      if (item.key !== key) return item;
      const requestedQuantity = Number(nextQuantity) || 1;
      const quantity = Math.max(1, Math.min(MAX_POS_QUANTITY, item.available_stock, requestedQuantity));
      if (requestedQuantity > MAX_POS_QUANTITY) showToast('error', MAX_POS_QUANTITY_MESSAGE);
      else if (requestedQuantity > item.available_stock) showToast('error', `Available stock: ${item.available_stock}`);
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
        const result = online ? await validatePosCart(cart, promotionCode) : await validateOfflineCart(cart);
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
  }, [cart, promotionCode,online]);

  const applyPromotion = () => {
    if (!online) return;
    const code = promotionInput.trim().toUpperCase();
    setPromotionCode(code);
    if (!code) setPromotionInput('');
  };

  const openPayment = () => {
    if (!quote?.valid || cartError || quoteLoading) return;
    if (!uncertainOnlineSale.current) idempotencyKeyRef.current = crypto.randomUUID();
    setPaymentError('');
    setPaymentOpen(true);
  };

  const completeSale = async ({ paymentMethod, amountTendered, paymentReference }) => {
    setPaymentProcessing(true);
    setPaymentError('');
    try {
      if (!online && uncertainOnlineSale.current) throw new Error('The previous online payment has not been confirmed. Reconnect and retry it before starting an offline sale.');
      if (!online) {
        const saved = await commitOfflineCashSale({ items:cart,amountTendered,paymentMethod,transactionId:idempotencyKeyRef.current,cashier:user });
        setReceipt(saved);setPaymentOpen(false);setCart([]);setPromotionCode('');setPromotionInput('');idempotencyKeyRef.current=null;
        await offline.refreshLocal();await loadCatalog();
        return;
      }
      uncertainOnlineSale.current=true;
      const result = await createPosOrder({
        items: cart,
        paymentMethod,
        amountTendered,
        paymentReference,
        promotionCode,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setReceipt(result.receipt || result.order);
      uncertainOnlineSale.current=false;
      setPaymentOpen(false);
      setCart([]);
      setPromotionCode('');
      setPromotionInput('');
      idempotencyKeyRef.current = null;
      await Promise.all([loadCatalog(), loadSummary()]);
      await offline.refreshSnapshot().catch(()=>{});
    } catch (error) {
      setPaymentError(error.message || 'The sale could not be completed.');
      if (online && !['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'POS_ORDER_PROCESSING', 'POS_REQUEST_IN_PROGRESS'].includes(error.code) && !(error.status>=500)) {
        uncertainOnlineSale.current=false;
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
      const local = (await allPosValues('pending_sales')).map(s=>({ ...s, local:true }));
      if (!online) setRecentOrders(local);
      else {const result=await getPosOrders({limit:20});setRecentOrders([...local,...(result.orders || []).filter(o=>!local.some(s=>Number(s.server_order_id)===Number(o.id)))]);}
    } catch (error) {
      showToast('error', error.message || 'Recent sales could not be loaded.');
    } finally {
      setRecentLoading(false);
    }
  };

  const openReceipt = async (orderId) => {
    try {
      const local=await readPosValue('receipts',orderId);
      if(local?.server_order_id && online){
        const current=await getPosReceipt(local.server_order_id);
        await updateOfflineSale(local.id,{server_receipt:current,server_voided:current.status==='cancelled'});
        setReceipt({...current,offline_sale:true,status:'synchronized',server_voided:current.status==='cancelled',offline_receipt_number:local.receipt_number});
      }else setReceipt(local ? local.server_receipt ? {...local.server_receipt,offline_sale:true,status:'synchronized',server_voided:local.server_voided,offline_receipt_number:local.receipt_number} : local : await getPosReceipt(orderId));
      setRecentOpen(false);
    } catch (error) {
      showToast('error', error.message || 'Receipt could not be loaded.');
    }
  };

  const confirmVoid = async () => {
    if (!online || !voidTarget || voidReason.trim().length < 5) return;
    setVoidProcessing(true);
    try {
      await voidPosOrder(voidTarget.id, voidReason.trim());
      const local=offline.sales.find(s=>Number(s.server_order_id)===Number(voidTarget.id));
      if(local)await updateOfflineSale(local.id,{server_voided:true,server_receipt:{...local.server_receipt,status:'cancelled',payment_status:'refunded',voided_at:new Date().toISOString()}});
      setRecentOrders((current) => current.map((order) => order.id === voidTarget.id || Number(order.server_order_id)===Number(voidTarget.id) ? { ...order, status:order.local ? 'synchronized' : 'cancelled',server_voided:true, payment_status: 'refunded', voided_at: new Date().toISOString() } : order));
      setVoidTarget(null);
      setVoidReason('');
      await Promise.all([loadCatalog(), loadSummary()]);
      await offline.refreshLocal();await offline.refreshSnapshot().catch(()=>{});
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
        className="pos-product-tile group flex min-h-[160px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <div className="relative h-16 w-full overflow-hidden bg-slate-50">
          <img src={resolveProductImageUrl(product.image)} alt="" onError={handleProductImageError} width="160" height="64" loading="lazy" className="h-full w-full object-contain p-2" />
          {product.variants?.length > 0 && <span className="absolute left-2 top-2 rounded-lg bg-slate-950/88 px-2 py-1 text-[10px] font-bold text-white">{product.variants.length} variants</span>}
          {available <= 0 && <span className="absolute inset-0 grid place-items-center bg-white/75 text-xs font-black text-red-700">OUT OF STOCK</span>}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="truncate text-xs font-medium text-slate-600">{product.motorcycle_model || 'Motorcycle part'}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-950">{product.name}</h3>
          <p className="mt-1 truncate font-mono text-xs text-slate-500">{product.sku || product.part_number || 'No SKU'}</p>
          {product.color && <p className="mt-0.5 truncate text-xs text-slate-500">Color: {product.color}</p>}
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <strong className="text-sm text-slate-950">{formatCurrency(productPrice(product))}</strong>
            <span className={`text-xs font-semibold ${available > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{available} available</span>
          </div>
        </div>
      </button>
    );
  }), [products]);

  if (loading) {
    return <div className="grid h-screen place-items-center bg-slate-100"><div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-slate-700" /><p className="mt-3 text-sm text-slate-600">Opening POS…</p></div></div>;
  }

  if (accessDenied) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <AlertCircle className="mx-auto text-red-600" size={36} />
          <h1 className="mt-4 font-display text-2xl font-bold text-slate-950">POS access is not enabled</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your account is signed in, but it does not have the POS permission. Ask an owner or administrator to update your role permissions.</p>
          <button onClick={() => navigate(backPath || '/')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white"><ArrowLeft size={16} /> Back to dashboard</button>
        </div>
      </main>
    );
  }

  return (
    <div className="pos-shell flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-950" data-workspace={['owner', 'admin'].includes(user?.role) ? 'owner' : undefined}>
      <header className="pos-header flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {backPath && <button type="button" onClick={() => navigate(backPath)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Back to dashboard"><ArrowLeft size={19} /></button>}
          <BrandMark link={false} className="" />
          <div className="border-l border-slate-200 pl-3">
            <h1 className="font-display text-xl font-semibold">Point of Sale</h1>
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={12} /> {now.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {online && <button onClick={()=>setSetupOpen(true)} className="min-h-11 rounded-lg border px-2 text-xs font-semibold">Offline POS setup</button>}
          <button aria-label="Recent sales" onClick={openRecentSales} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><History size={16} /><span className="hidden sm:inline">Recent sales</span></button>
          <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 lg:flex">
            <UserRound size={16} className="text-slate-500" />
            <div><p className="text-xs font-semibold text-slate-950">{user?.name || 'Cashier'}</p><p className="text-[10px] capitalize text-slate-500">{user?.role?.replace('_', ' ')}</p></div>
          </div>
        </div>
      </header>

      <div className={`shrink-0 border-b px-3 py-2 text-xs sm:px-5 ${online?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`} role="status" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2"><p><strong>{offline.syncing?'↻ Synchronizing':online?'● Online':'● Offline mode'}</strong> · {online ? offline.pending ? `${offline.pending} pending transaction(s)` : 'All transactions synchronized.' : `Cash sales are available. Pending sync: ${offline.pending}`}</p>{online && offline.pending>0 && <button disabled={offline.syncing} onClick={async()=>{await connection.check();await offline.sync();await loadCatalog();}} className="min-h-11 rounded-lg border px-3 font-semibold">Sync now</button>}{!online && <button onClick={()=>{lockLocalPos();window.dispatchEvent(new Event('offline-pos:prepared'));}} className="min-h-11 rounded-lg border px-3 font-semibold">Lock POS</button>}</div>
        {!online && <><p>Online payments are unavailable while offline. Cash payments are still available.</p><p>Promotions require an internet connection.</p><p>Last inventory sync: {offline.snapshot ? new Date(offline.snapshot.created_at).toLocaleString() : 'Not prepared'}</p>{offline.snapshot && Date.parse(offline.snapshot.expires_at)<=Date.now() && <p role="alert">Offline catalogue and access have expired. Reconnect before starting another sale. Pending sales are saved.</p>}</>}
        {offline.message && <p role="alert">{offline.message}</p>}
        {offline.sales.filter(s=>s.status==='attention').map(s=><div key={s.id} className="mt-1 flex flex-wrap items-center gap-2"><p>{s.receipt_number}: Needs attention. {s.last_error}</p>{online && ['owner','admin','super_admin'].includes(user?.role) && <button className="min-h-11 rounded border px-2" onClick={async()=>{if(window.confirm('Confirm the physical sale and correct inventory/reserve before retrying. The original transaction ID will be preserved.')){await updateOfflineSale(s.id,{status:'pending',next_attempt_at:0});await offline.sync();}}}>Retry after stock review</button>}</div>)}
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1">
        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
              <div className="relative col-span-2 flex-1">
                <label htmlFor="pos-search" className="sr-only">Search products or scan a barcode</label>
                <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  id="pos-search"
                  type="search"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, SKU, barcode, part number…"
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
                  autoFocus
                />
                {catalogLoading && <Loader2 size={17} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-slate-600" />}
              </div>
              <button type="button" onClick={() => setScannerOpen(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-orange-400 bg-orange-50 px-3 text-sm font-bold text-orange-800 hover:bg-orange-100 sm:px-4">
                <ScanLine size={18} aria-hidden="true" /> <span className="sm:hidden">Scan</span><span className="hidden sm:inline">Scan with Camera</span>
              </button>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Filter by category" className="h-12 min-w-0 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold focus:border-orange-500 focus:outline-none">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <p className="mt-2 hidden text-xs text-slate-500 sm:block">Use the phone camera, type manually, or keep using a physical barcode scanner.</p>
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{productGrid}</div>
            )}
          </div>
        </section>

        <aside className={`flex min-h-0 flex-col border-t border-slate-200 bg-white lg:border-l lg:border-t-0 lg:shadow-none ${saleExpanded && !isDesktop ? 'max-h-[78dvh]' : ''}`} aria-label="Current sale">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 lg:h-16">
            {isDesktop ? (
              <div className="flex items-center gap-2"><ShoppingCart size={19} aria-hidden="true" /><h2 className="font-sans text-base font-semibold">Current sale</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums">{cartCount}</span></div>
            ) : (
              <button type="button" onClick={() => setSaleExpanded((value) => !value)} aria-expanded={saleExpanded} aria-controls="pos-sale-lines" className="-ml-2 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left">
                <ShoppingCart size={19} aria-hidden="true" />
                <h2 className="font-sans text-base font-semibold">Current sale</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums">{cartCount}</span>
                <span className="ml-auto text-xs font-semibold text-slate-500">{saleExpanded ? 'Hide items' : 'Show items'}</span>
                <ChevronUp size={18} className={`shrink-0 text-slate-500 transition-transform ${saleExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            )}
            {cart.length > 0 && <button type="button" onClick={() => { setCart([]); setPromotionCode(''); setPromotionInput(''); }} className="min-h-11 shrink-0 px-2 text-xs font-semibold text-red-600 hover:underline">Clear</button>}
          </div>

          <div id="pos-sale-lines" className={`min-h-0 flex-1 overflow-y-auto p-3 ${isDesktop || saleExpanded ? '' : 'hidden'}`}>
            {cart.length === 0 ? (
              <div className="grid h-full min-h-56 place-items-center text-center">
                <div><ShoppingCart className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm font-semibold text-slate-700">Cart is empty</p><p className="mt-1 text-xs text-slate-500">Select a product to begin.</p></div>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.key} className="pos-sale-line border-b border-slate-200 py-3">
                    <div className="flex gap-3">
                      <img src={resolveProductImageUrl(item.variant?.image_url || item.product.image)} alt="" onError={handleProductImageError} width="48" height="48" className="h-12 w-12 rounded-lg bg-slate-100 object-contain" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.product.name}</p><p className="mt-1 truncate font-mono text-xs text-slate-600">{item.product.part_number || item.product.sku || 'No part number'}</p>
                        {item.variant && <p className="truncate text-xs text-slate-500">{item.variant.variant_type}: {item.variant.variant_value}</p>}
                        <p className="mt-1 text-xs font-bold">{formatCurrency(productPrice(item.product, item.variant))}</p>
                      </div>
                      <button onClick={() => removeLine(item.key)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.product.name}`}><Trash2 size={16} /></button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-slate-200">
                        <button onClick={() => updateQuantity(item.key, item.quantity - 1)} className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50" aria-label="Decrease quantity"><Minus size={14} /></button>
                        <input type="number" min="1" max={Math.min(MAX_POS_QUANTITY, item.available_stock)} value={item.quantity} onChange={(event) => updateQuantity(item.key, event.target.value)} className="h-9 w-11 border-x border-slate-200 text-center text-sm font-bold focus:outline-none" aria-label={`${item.product.name} quantity`} />
                        <button disabled={item.quantity >= Math.min(MAX_POS_QUANTITY, item.available_stock)} onClick={() => updateQuantity(item.key, item.quantity + 1)} className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300" aria-label="Increase quantity"><Plus size={14} /></button>
                      </div>
                      <strong className="text-sm">{formatCurrency(productPrice(item.product, item.variant) * item.quantity)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:p-4">
            {online && capabilities?.can_discount && (isDesktop || saleExpanded) && (
              <div className="mb-3">
                <label htmlFor="promotion-code" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Tag size={13} /> Promotion code</label>
                <div className="flex gap-2">
                  <input id="promotion-code" value={promotionInput} onChange={(event) => setPromotionInput(event.target.value.toUpperCase())} placeholder="Enter code" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold focus:border-orange-500 focus:outline-none" />
                  <button onClick={applyPromotion} disabled={!cart.length} className="rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40">{promotionCode ? 'Update' : 'Apply'}</button>
                </div>
              </div>
            )}

            <dl className="space-y-2 text-sm">
              <div className="hidden justify-between text-slate-600 lg:flex"><dt>Subtotal</dt><dd>{quoteLoading ? 'Validating…' : formatCurrency(quote?.subtotal_amount || 0)}</dd></div>
              {Number(quote?.discount_amount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount {quote?.promotion?.code && `(${quote.promotion.code})`}</dt><dd>-{formatCurrency(quote.discount_amount)}</dd></div>}
              <div className="flex items-end justify-between lg:border-t lg:border-slate-200 lg:pt-3"><dt className="font-sans text-base font-semibold">Total</dt><dd className="font-sans text-2xl font-bold tabular-nums lg:text-3xl">{formatCurrency(displayTotal)}</dd></div>
            </dl>
            {cartError && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{cartError}</div>}
            <button onClick={openPayment} disabled={!cart.length || !quote?.valid || quoteLoading || Boolean(cartError)} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 lg:mt-4 lg:min-h-14 px-5 text-base font-bold text-slate-950 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40">
              <ReceiptText size={19} /> Pay {formatCurrency(displayTotal)}
            </button>
          </div>
        </aside>
      </main>

      <CameraScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scan POS Item"
        onScan={(value) => { void handleCameraScan(value); }}
      />

      {selectedProduct && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="variant-title">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div><p className="text-xs font-semibold text-slate-600">Choose variant</p><h2 id="variant-title" className="mt-1 font-display text-lg font-bold">{selectedProduct.name}</h2></div>
              <button onClick={() => setSelectedProduct(null)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close variant selector"><X size={19} /></button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {selectedProduct.variants.map((variant) => (
                <button key={variant.id} onClick={() => addLine(selectedProduct, variant)} disabled={variant.available_stock <= 0} className="flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 text-left hover:border-orange-400 hover:bg-orange-50/40 disabled:opacity-45">
                  <div><p className="text-sm font-semibold">{variant.variant_type}: {variant.variant_value}</p><p className="font-mono text-xs text-slate-500">{variant.sku || 'No SKU'}</p></div>
                  <div className="text-right"><p className="text-sm font-bold">{formatCurrency(productPrice(selectedProduct, variant))}</p><p className={`text-xs ${variant.available_stock > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{variant.available_stock} available</p></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {paymentOpen && <PaymentModal offline={!online} total={displayTotal} processing={paymentProcessing} error={paymentError} onComplete={completeSale} onCancel={() => !paymentProcessing && setPaymentOpen(false)} />}
      {setupOpen && online && <OfflinePosSetup onClose={()=>setSetupOpen(false)} offline={offline} user={user} capabilities={capabilities} />}
      {receipt && <ReceiptModal order={receipt} onClose={() => setReceipt(null)} onNewSale={() => { setReceipt(null); searchRef.current?.focus(); }} />}

      {recentOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="recent-sales-title">
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div><p className="text-xs font-semibold text-slate-600">POS history</p><h2 id="recent-sales-title" className="mt-1 font-display text-xl font-bold">Recent sales</h2></div>
              <button onClick={() => setRecentOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" aria-label="Close recent sales"><X size={19} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {recentLoading ? <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-red-600" /></div> : recentOrders.length === 0 ? <EmptyState icon={History} title="No POS sales yet" /> : (
                <div className="space-y-2">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-mono text-xs font-bold">{order.receipt_number || `Order #${order.id}`}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString('en-PH')} · {order.cashier_name}</p></div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${order.status === 'cancelled' || order.server_voided ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{order.server_voided ? 'Voided' : order.local ? order.status==='synchronized' ? 'Synchronized' : order.status==='attention' ? 'Needs attention' : 'Pending sync' : order.status === 'cancelled' ? 'Voided' : order.payment_method}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <strong>{formatCurrency(order.total_amount)}</strong>
                        <div className="flex gap-2">
                          {online && capabilities?.can_void && !order.server_voided && (order.status === 'paid' || order.status==='synchronized') && <button onClick={() => setVoidTarget(order.local ? {...order,id:order.server_order_id} : order)} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Void</button>}
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
