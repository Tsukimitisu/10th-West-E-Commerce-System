import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Heart, User, Menu, X, ChevronDown, LogOut, Package, MapPin, RotateCcw, Shield, Monitor, Bell, Search, SlidersHorizontal, Grid3X3, List, MessageCircle, Home, Headphones, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, getAnnouncements, getProducts, getBuyerChatConversations } from '../services/api';
import { Role } from '../types.js';
import { useCart } from '../context/CartContext';
import { useSocket } from '../context/SocketContext';
import CartDrawer from './CartDrawer';
import BrandMark from './ui/BrandMark';
import Modal from './owner/Modal';
import { ConfirmationDialog } from './ui/BrandPrimitives';
import { handleProductImageError, resolveProductImageUrl } from '../utils/productImages.js';
import { repairMojibake } from '../utils/text.js';
import { shouldReturnEmptyProductSearch } from '../utils/productSearchSafety.js';

const Navbar = ({ user, onLogout }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [, setScrolled] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const { itemCount } = useCart();
  const { on, off, connected } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [globalSearch, setGlobalSearch] = useState(searchParams.get('search') || '');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const searchDropdownRef = useRef(null);
  const mobileSearchDropdownRef = useRef(null);
  const userMenuRef = useRef(null);
  const notifRef = useRef(null);
  const supportMenuRef = useRef(null);
  const searchRequestRef = useRef(0);
  const searchCacheRef = useRef(new Map());
  // Suggestions only open after the shopper types; a search restored from the URL
  // (e.g. /shop?search=…) must not pop a dropdown over the results it already shows.
  const searchTypedRef = useRef(false);

  const formatNotificationTime = (notification) => (
    notification.created_at || notification.published_at
      ? new Date(notification.created_at || notification.published_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : ''
  );

  const normalizeIncomingNotification = (notification) => {
    const metadata = notification?.metadata && typeof notification.metadata === 'string'
      ? (() => {
          try { return JSON.parse(notification.metadata); } catch { return null; }
        })()
      : (notification?.metadata ?? null);

    return {
      ...notification,
      metadata,
      thumbnail_url: notification?.thumbnail_url ?? metadata?.thumbnail_url ?? metadata?.product_image ?? null,
    };
  };

  const toSentenceCase = (value) => {
    if (!value) return '';
    const normalized = String(value).replace(/[_-]+/g, ' ').trim();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const getNotificationTitle = (notification) => {
    const normalized = normalizeIncomingNotification(notification);

    if (normalized.title) return normalized.title;

    if (normalized.type === 'announcement') return 'Store announcement';

    if (normalized.reference_type === 'order' || normalized.type === 'order.status') {
      const orderNumber = normalized.metadata?.order_number || normalized.reference_id;
      return orderNumber ? `Order #${String(orderNumber).padStart(4, '0')} update` : 'Order update';
    }

    if (normalized.type === 'return.status') {
      const returnId = normalized.metadata?.return_id;
      return returnId ? `Return Request #${returnId} update` : 'Return request update';
    }

    return 'Notification';
  };

  const getNotificationSummary = (notification) => {
    const normalized = normalizeIncomingNotification(notification);

    if (normalized.type === 'announcement') {
      return normalized.message || '';
    }

    if (normalized.message) {
      return normalized.message;
    }

    if (normalized.metadata?.status && normalized.reference_type === 'order') {
      const statusLabel = toSentenceCase(normalized.metadata.status);
      const productName = normalized.metadata?.product_name;
      return productName
        ? `${statusLabel} for ${productName}.`
        : `Order status: ${statusLabel}.`;
    }

    if (normalized.metadata?.status && normalized.type === 'return.status') {
      const statusLabel = toSentenceCase(normalized.metadata.status);
      const productName = normalized.metadata?.product_name;
      return productName
        ? `${statusLabel} for ${productName}.`
        : `Return request ${statusLabel.toLowerCase()}.`;
    }

    return '';
  };

  const getNotificationIcon = (notification) => {
    const type = `${notification?.type || ''} ${notification?.metadata?.status || ''}`.toLowerCase();
    if (/failed|error|cancelled|rejected/.test(type)) return <XCircle size={16} aria-label="Error notification" />;
    if (/warning|stock|low/.test(type)) return <AlertTriangle size={16} aria-label="Warning notification" />;
    if (/success|paid|delivered|approved/.test(type)) return <CheckCircle2 size={16} aria-label="Success notification" />;
    if (/info|announcement/.test(type)) return <Info size={16} aria-label="Information notification" />;
    return <Bell size={16} aria-label="Notification" />;
  };

  const getNotificationTypeLabel = (notification) => {
    const normalized = normalizeIncomingNotification(notification);

    if (normalized.type === 'announcement') return 'Announcement';
    if (normalized.reference_type === 'order' || normalized.type === 'order.status') return 'Order';
    if (normalized.type === 'return.status') return 'Return';
    return 'Update';
  };

  const userMenuItemClass = 'flex items-center gap-3 px-4 py-2.5 text-sm text-gray-100 hover:text-white hover:bg-zinc-800 focus-visible:bg-zinc-800 transition-colors duration-200 ease-in-out';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setSupportMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target) && (!mobileSearchDropdownRef.current || !mobileSearchDropdownRef.current.contains(e.target))) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const query = String(globalSearch || '').trim();

    if (!query || query.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    if (!searchTypedRef.current) return;

    if (shouldReturnEmptyProductSearch(query)) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setShowDropdown(true);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const normalizedQuery = query.toLowerCase();
    const cachedResults = searchCacheRef.current.get(normalizedQuery);
    if (cachedResults) {
      setSearchResults(cachedResults);
      setSearchError(null);
      setShowDropdown(true);
      setIsSearching(false);
      return;
    }

    const requestId = ++searchRequestRef.current;

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const results = await getProducts({ search: query, limit: 8 });
        if (requestId !== searchRequestRef.current) return;

        const nextResults = (results || []).slice(0, 8);
        searchCacheRef.current.set(normalizedQuery, nextResults);
        if (searchCacheRef.current.size > 40) {
          const oldestKey = searchCacheRef.current.keys().next().value;
          if (oldestKey) searchCacheRef.current.delete(oldestKey);
        }

        setSearchResults(nextResults);
        setShowDropdown(true);
      } catch (err) {
        if (requestId !== searchRequestRef.current) return;
        console.error("Search error:", err);
        setSearchError("Failed to fetch products");
      } finally {
        if (requestId === searchRequestRef.current) {
          setIsSearching(false);
        }
      }
    }, 220);

    return () => clearTimeout(delayDebounceFn);
  }, [globalSearch]);

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    setNotifError(false);
    try {
      const [count, list, anns] = await Promise.all([
        getUnreadNotificationCount().catch(() => 0),
        getNotifications(),
        getAnnouncements().catch(() => []),
      ]);
      setUnreadCount(count || 0);

      const mappedAnns = (anns || []).map(a => ({
        ...a,
        is_read: true,
        type: 'announcement',
        message: a.content
      }));

      const combined = [...(list || []), ...mappedAnns].sort((a, b) => {
        const dateA = new Date(a.created_at || a.published_at || 0);
        const dateB = new Date(b.created_at || b.published_at || 0);
        return dateB - dateA;
      }).slice(0, 20);

      setNotifications(combined);
    } catch {
      setNotifError(true);
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  const refreshMessageUnread = useCallback(async () => {
    if (!user || user.role !== Role.CUSTOMER) {
      setMessageUnreadCount(0);
      return;
    }

    try {
      const unreadChats = await getBuyerChatConversations({ status: 'unread' });
      const total = (unreadChats || []).reduce((sum, chat) => sum + Number(chat.unread_count || 0), 0);
      setMessageUnreadCount(total);
    } catch {
      setMessageUnreadCount(0);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setNotifLoading(true);
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [user, refreshNotifications]);

  useEffect(() => {
    if (!user) return;
    refreshMessageUnread();
    const interval = setInterval(refreshMessageUnread, 30000);
    return () => clearInterval(interval);
  }, [user, refreshMessageUnread]);

  useEffect(() => {
    if (!user || !connected) return;

    const handleNotification = (notification) => {
      if (!notification) {
        refreshNotifications();
        return;
      }
      if (notification.user_id && notification.user_id !== user.id) {
        return;
      }
      const normalized = normalizeIncomingNotification(notification);
      setNotifications((prev) => [normalized, ...prev.filter((item) => item.id !== normalized.id)].slice(0, 10));
      if (normalized.is_read === false || normalized.is_read == null) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    const handleOrderEvent = () => {
      refreshNotifications();
    };

    on('notification', handleNotification);
    on('order:new', handleOrderEvent);
    on('order:updated', handleOrderEvent);
    on('message:new', refreshMessageUnread);
    on('message:read', refreshMessageUnread);

    return () => {
      off('notification', handleNotification);
      off('order:new', handleOrderEvent);
      off('order:updated', handleOrderEvent);
      off('message:new', refreshMessageUnread);
      off('message:read', refreshMessageUnread);
    };
  }, [user, connected, on, off, refreshNotifications, refreshMessageUnread]);

  useEffect(() => {
    const notifHandler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (supportMenuRef.current && !supportMenuRef.current.contains(e.target)) setSupportMenuOpen(false);
    };
    document.addEventListener('mousedown', notifHandler);
    return () => document.removeEventListener('mousedown', notifHandler);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) { console.error(e); }
  };

  const handleMarkRead = async (id, type) => {
    if (type === 'announcement') return;
    try {
      await markNotificationRead(id);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) { console.error(e); }
  };

  const handleNotificationClick = async (n) => {
    // Mark as read first
    if (n.type !== 'announcement' && !n.is_read) {
      await handleMarkRead(n.id, n.type);
    }
    setNotifOpen(false);

    // Navigate to relevant page based on type or reference_type
    const refType = n.reference_type || n.type;
    const refId = n.reference_id;

    if (refType === 'order' || refType === 'order_status') {
      if (user.role === 'customer') {
        navigate(refId ? `/orders/${refId}` : '/orders');
      } else {
        navigate(refId ? `/admin/orders` : '/admin/orders');
      }
    } else if (refType === 'support' || refType === 'ticket' || refType === 'message') {
      if (user.role === 'customer') {
        navigate('/contact');
      } else {
        navigate('/admin/support');
      }
    } else if (refType === 'promo') {
      navigate(refId ? `/products/${refId}` : '/shop');
    } else if (refType === 'inventory' || refType === 'product') {
       if (user.role !== 'customer') {
         navigate('/admin/inventory');
       } else {
         navigate(refId ? `/products/${refId}` : '/shop');
       }
    } else {
      // Fallback
      if (user.role === 'customer') {
        navigate('/');
      } else {
        navigate('/admin');
      }
    }
  };

  const isShopRoute = location.pathname === '/shop';
  const isHomeRoute = location.pathname === '/';
  const shouldShowGlobalSearch = isShopRoute || isHomeRoute;
  const navLinkClass = (active) => `relative px-2.5 py-2 text-sm font-semibold transition-colors duration-200 after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-0.5 after:origin-left after:rounded-full after:bg-orange-500 after:transition-transform after:duration-200 ${active ? 'text-white after:scale-x-100' : 'text-slate-300 after:scale-x-0 hover:text-white hover:after:scale-x-100'}`;
  const showInternalProductMeta = user?.role === Role.OWNER
    || user?.role === Role.STORE_STAFF
    || user?.role === Role.ADMIN
    || user?.role === Role.SUPER_ADMIN;

  useEffect(() => {
    if (isShopRoute) {
      const urlSearch = searchParams.get('search') || '';
      setGlobalSearch((current) => {
        // Same query (ignoring the trailing space being typed): keep the input as-is.
        if (current.trim() === urlSearch.trim()) return current;
        searchTypedRef.current = false;
        return urlSearch;
      });
    } else if (isHomeRoute) {
      searchTypedRef.current = false;
      setGlobalSearch('');
    }
  }, [isShopRoute, isHomeRoute, searchParams]);

  const updateShopParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    searchTypedRef.current = true;
    setGlobalSearch(value);

    if (isShopRoute) {
      updateShopParams({ search: value.trim() || null });
    }
  };

  const handleGlobalSearchSubmit = (e) => {
    e.preventDefault();
    searchTypedRef.current = false;
    setShowDropdown(false);
    const value = globalSearch.trim();

    if (isShopRoute) {
      if (value) updateShopParams({ search: value });
      else {
        const next = new URLSearchParams(searchParams);
        next.set('search', '');
        setSearchParams(next, { replace: true });
      }
      return;
    }

    if (!value) {
      navigate('/shop?search=');
      return;
    }

    navigate(`/shop?search=${encodeURIComponent(value)}`);
  };

  if (location.pathname === '/pos') return null;

  return (
    <>
      {/* Main navbar */}
      <header className="storefront-header sticky top-0 z-50 border-b border-white/10">
        <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
          <div className="flex items-center justify-between h-[72px]">
            {/* Mobile menu button */}
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} className="order-3 lg:hidden p-2.5 -mr-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
              <Menu size={22} />
            </button>

            {/* Logo */}
            <BrandMark dark className="shrink-0 transition-opacity hover:opacity-90" />

            {/* Desktop navigation - Center */}
            <nav className="ml-6 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex xl:ml-8" aria-label="Primary navigation">
              <Link to="/" aria-current={location.pathname === '/' ? 'page' : undefined} className={navLinkClass(location.pathname === '/')}>
                Home
              </Link>
              <Link to="/shop" aria-current={location.pathname === '/shop' ? 'page' : undefined} className={navLinkClass(location.pathname === '/shop')}>
                Shop
              </Link>
              <div ref={supportMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setSupportMenuOpen(!supportMenuOpen)}
                  className={`${navLinkClass(location.pathname === '/faq' || location.pathname === '/contact')} flex items-center gap-1.5`}
                  aria-expanded={supportMenuOpen}
                  aria-haspopup="menu"
                >
                  Support <ChevronDown size={14} className={`transition-transform duration-200 ${supportMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {supportMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0d1422] py-1.5 shadow-2xl animate-fade-in" role="menu">
                    <Link to="/faq" className="block px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors duration-150 hover:bg-white/5 hover:text-orange-400" role="menuitem">
                      Help & FAQ
                    </Link>
                    <Link to="/contact" className="block px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors duration-150 hover:bg-white/5 hover:text-orange-400" role="menuitem">
                      Contact Support
                    </Link>
                  </div>
                )}
              </div>
            </nav>

            {/* Desktop Search Bar */}
            {shouldShowGlobalSearch && (
              <form onSubmit={handleGlobalSearchSubmit} className="hidden lg:flex items-center justify-center gap-2 mx-4 flex-1 max-w-md" ref={searchDropdownRef}>
                <div className="relative flex-1">
                  <button
                    type="submit"
                    aria-label="Search"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-400 transition-colors duration-200 cursor-pointer"
                  >
                    <Search size={18} />
                  </button>
                  <input
                    value={globalSearch}
                    onChange={handleSearchChange}
                    onFocus={() => { if (searchTypedRef.current && globalSearch.trim().length >= 2) setShowDropdown(true); }}
                    aria-label="Search products"
                    type="search"
                    autoComplete="off"
                    placeholder={isShopRoute ? 'Search product names…' : 'Search parts, brands…'}
                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-700 bg-zinc-900 text-sm text-white placeholder-gray-400 focus:outline-none focus:bg-zinc-800 focus:ring-2 focus:ring-orange-500/30 focus:border-red-300 transition-colors duration-200"
                  />
                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-gray-700 rounded-xl shadow-2xl z-[100] max-h-[400px] flex flex-col overflow-hidden">
                      {isSearching ? (
                        <div className="p-4 text-center text-sm text-gray-400">Searching…</div>
                      ) : searchError ? (
                        <div className="p-4 text-center text-sm text-slate-300">{searchError}</div>
                      ) : searchResults.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-400">No products found</div>
                      ) : (
                        <>
                          <div className="overflow-y-auto">
                            {searchResults.map((product) => (
                              <Link
                                key={product.id}
                                to={`/products/${product.id}`}
                                onClick={() => setShowDropdown(false)}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-gray-700/50"
                              >
                                {product.image_url ? (
                                  <img src={resolveProductImageUrl(product.image_url)} alt={product.name} onError={handleProductImageError} className="w-10 h-10 rounded-md object-cover bg-gray-900" />
                                ) : (
                                  <div className="w-10 h-10 rounded-md bg-gray-900 flex items-center justify-center shrink-0"><Package size={16} className="text-gray-500" /></div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                                  <p className="text-xs text-gray-400 truncate">
                                    {product.part_number || product.sku || product.motorcycle_model || product.category_name}
                                  </p>
                                </div>
                                <div className="text-right text-sm font-bold text-orange-300 shrink-0">₱{Number(product.price || 0).toFixed(2)}<span className="block text-[10px] font-medium text-slate-300">{Number(product.stock_quantity || 0) > 0 ? 'In stock' : 'Out of stock'}</span></div>
                              </Link>
                            ))}
                          </div>
                          <Link to={`/shop?search=${encodeURIComponent(globalSearch.trim())}`} onClick={() => { searchTypedRef.current = false; setShowDropdown(false); updateShopParams({ search: globalSearch.trim() || null }); }} className="block w-full text-center text-xs font-bold text-red-500 py-3 bg-zinc-800/80 hover:bg-zinc-700/80 hover:text-orange-300 transition-colors uppercase tracking-wider shrink-0 border-t border-gray-700">
                            View All Results
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </form>
            )}

            {/* Right actions */}
            <div className="header-tools ml-auto flex items-center gap-1">
              <button type="button" aria-label="Open product search" aria-expanded={mobileSearchOpen} aria-controls="mobile-product-search" onClick={() => { if (!shouldShowGlobalSearch) navigate('/shop'); setMobileSearchOpen(open => !open); }} className="grid h-11 w-11 place-items-center text-slate-300 lg:hidden"><Search size={21} aria-hidden="true" /></button>
              {/* Notifications */}
              {user && (
                <div ref={notifRef} className="relative">
                  <button onClick={() => setNotifOpen(!notifOpen)} aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} className="hidden lg:block p-2.5 text-zinc-400 hover:text-orange-400 hover:bg-zinc-800/50 rounded-lg transition-colors relative">
                    <Bell size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 bg-orange-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="customer-notification-panel fixed left-4 right-4 top-[73px] z-50 max-h-[calc(100dvh-5rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-fade-in sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem] sm:max-w-[calc(100vw-2rem)]">
                      <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">Notifications</h3>
                          {unreadCount > 0 && (
                            <button onClick={handleMarkAllRead} className="text-xs text-slate-600 hover:text-orange-800 font-semibold transition-colors">
                              Mark all read
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'You are all caught up'}
                        </p>
                      </div>

                      <div className="max-h-[min(26rem,calc(100dvh-10rem))] overflow-x-hidden overflow-y-auto">
                        {notifLoading ? (
                          <div role="status" className="p-9 text-center text-sm text-slate-600">Loading notifications...</div>
                        ) : notifError ? (
                          <div role="alert" className="space-y-3 p-6 text-center text-sm text-slate-600"><p>Unable to load notifications.</p><button type="button" onClick={() => { setNotifLoading(true); refreshNotifications(); }} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-900">Try again</button></div>
                        ) : notifications.length === 0 ? (
                          <div className="p-9 text-center text-slate-600 text-sm">
                            <Bell size={24} className="mx-auto mb-2 opacity-40" />
                            No notifications yet
                          </div>
                        ) : (
                          notifications.map((notification, i) => {
                            const n = normalizeIncomingNotification(notification);
                            const title = repairMojibake(getNotificationTitle(n));
                            const summary = repairMojibake(getNotificationSummary(n));
                            const typeLabel = getNotificationTypeLabel(n);

                            return (
                              <button
                                key={`${n.id || n.title}-${i}`}
                                onClick={() => handleNotificationClick(n)}
                                className={`w-full min-w-0 max-w-full break-words px-4 py-3.5 text-left transition-colors border-b border-slate-200 last:border-b-0 hover:bg-slate-50 [overflow-wrap:anywhere] ${!n.is_read ? 'bg-slate-50' : 'bg-transparent'}`}
                              >
                                <div className="flex items-start gap-3.5">
                                  <div className="mt-0.5 shrink-0">
                                    {n.thumbnail_url ? (
                                      <img src={resolveProductImageUrl(n.thumbnail_url)} alt="" onError={handleProductImageError} className="h-11 w-11 rounded-xl object-cover bg-slate-100 border border-slate-200 shadow-sm" />
                                    ) : (
                                      <div className="h-10 w-10 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 flex items-center justify-center">
                                        {getNotificationIcon(n)}
                                      </div>
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className={`text-sm leading-5 ${!n.is_read ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>{title}</p>
                                        {summary && <p className="mt-1 text-xs leading-5 text-slate-600 line-clamp-2">{summary}</p>}
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-600">{typeLabel}</span>
                                          <span>{formatNotificationTime(n)}</span>
                                        </div>
                                      </div>
                                      {!n.is_read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-600" />}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Wishlist */}
              {user && (
                <Link to="/wishlist" aria-label="Wishlist" className="p-2.5 text-zinc-400 hover:text-orange-400 hover:bg-zinc-800/50 rounded-lg transition-colors hidden sm:flex">
                  <Heart size={20} />
                </Link>
              )}

              {user?.role === Role.CUSTOMER && (
                <Link to="/messages" aria-label="Messages" className="p-2.5 text-zinc-400 hover:text-orange-400 hover:bg-zinc-800/50 rounded-lg transition-colors hidden sm:flex relative">
                  <MessageCircle size={20} />
                  {messageUnreadCount > 0 && (
                    <span className="absolute top-1 right-1 bg-orange-600 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center shadow-md">
                      {messageUnreadCount > 99 ? '99+' : messageUnreadCount}
                    </span>
                  )}
                </Link>
              )}

              {/* Cart */}
              <button aria-label={`Open cart, ${itemCount} items`} onClick={() => setCartOpen(true)} className="p-2.5 text-zinc-400 hover:text-orange-400 hover:bg-zinc-800/50 rounded-lg transition-colors relative">
                <ShoppingCart size={20} />
                {itemCount > 0 && (
                  <span className="absolute top-1 right-1 bg-orange-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              {/* User menu */}
              {user ? (
                <div ref={userMenuRef} className="relative header-secondary-action">
                  <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="p-2 text-red-500 hover:text-orange-300 ml-2 flex items-center gap-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-8 h-8 rounded-lg object-cover border border-zinc-700 shadow-sm"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-slate-100 text-slate-900 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm">
                        {(user.name || user.email || 'Customer').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="hidden md:block text-sm font-semibold text-orange-300 max-w-20 truncate">{(user.name || user.email || 'Customer').split(' ')[0]}</span>
                    <ChevronDown size={14} className="hidden md:block text-gray-300" />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-950/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-700 py-2 animate-fade-in">
                      <div className="px-4 py-3 border-b border-zinc-700 mb-1">
                        <p className="text-sm font-bold text-white truncate">{user.name || user.email || 'Customer'}</p>
                        <p className="text-xs text-gray-300 truncate">{user.email}</p>
                      </div>
                      <Link to="/profile" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}><User size={16} className="text-slate-300" /> My Profile</Link>
                      <Link to="/orders" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}><Package size={16} className="text-slate-300" /> My Orders</Link>
                      {user?.role === Role.CUSTOMER && (
                        <Link to="/messages" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}>
                          <MessageCircle size={16} className="text-slate-300" /> Messages
                          {messageUnreadCount > 0 && (
                            <span className="ml-auto rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              {messageUnreadCount > 99 ? '99+' : messageUnreadCount}
                            </span>
                          )}
                        </Link>
                      )}
                      <Link to="/wishlist" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}><Heart size={16} className="text-slate-300" /> Wishlist</Link>
                      <Link to="/addresses" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}><MapPin size={16} className="text-slate-300" /> Address Book</Link>
                      <Link to="/my-returns" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}><RotateCcw size={16} className="text-slate-300" /> Returns</Link>
                      {(user?.role === Role.OWNER || user?.role === Role.STORE_STAFF) && (
                        <>
                          <div className="border-t border-zinc-700 mt-1 pt-1" />
                          <Link to="/admin" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}><Shield size={16} className="text-slate-300" /> Admin Panel</Link>
                          <Link to="/pos" onClick={() => setUserMenuOpen(false)} className={userMenuItemClass}><Monitor size={16} className="text-slate-300" /> POS Terminal</Link>
                        </>
                      )}
                      <div className="border-t border-zinc-700 mt-1 pt-1">
                        <button onClick={() => setShowLogoutConfirm(true)} className={`${userMenuItemClass} w-full`}>
                          <LogOut size={16} className="text-slate-300" /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="ml-3 hidden min-h-11 items-center px-5 py-2 bg-orange-600 text-slate-950 text-sm font-semibold rounded-lg transition-colors duration-200 lg:inline-flex">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>

      </header>

      {/* Mobile search bar */}
      {shouldShowGlobalSearch && mobileSearchOpen && (
        <div id="mobile-product-search" className="sticky top-[73px] z-40 border-b border-white/10 bg-[#080A0E] lg:hidden">
          <div className="max-w-7xl mx-auto px-4 py-2 flex justify-center">
            <form onSubmit={handleGlobalSearchSubmit} className="flex items-center gap-2 w-full" ref={mobileSearchDropdownRef}>
              <div className="relative flex-1">
                <button
                  type="submit"
                  aria-label="Search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-400 transition-colors duration-200 cursor-pointer"
                >
                  <Search size={18} />
                </button>
                <input
                  value={globalSearch}
                  onChange={handleSearchChange}
                  onFocus={() => { if (searchTypedRef.current && globalSearch.trim().length >= 2) setShowDropdown(true); }}
                  aria-label="Search products"
                  type="search"
                  autoComplete="off"
                  placeholder={isShopRoute ? 'Search product names…' : 'Search parts…'}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-zinc-750 bg-zinc-900 text-sm text-white placeholder-zinc-500 focus:outline-none focus:bg-zinc-800 focus:ring-2 focus:ring-orange-500/30 focus:border-red-500 transition-colors duration-200"
                />
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-gray-700 rounded-xl shadow-2xl z-[100] max-h-[350px] flex flex-col overflow-hidden">
                    {isSearching ? (
                      <div className="p-4 text-center text-sm text-gray-400">Searching…</div>
                    ) : searchError ? (
                      <div className="p-4 text-center text-sm text-slate-300">{searchError}</div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-400">No products found</div>
                    ) : (
                      <>
                        <div className="overflow-y-auto">
                          {searchResults.map((product) => (
                            <Link
                              key={product.id}
                              to={`/products/${product.id}`}
                              onClick={() => setShowDropdown(false)}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-gray-700/50"
                            >
                              {product.image_url ? (
                                <img src={resolveProductImageUrl(product.image_url)} alt={product.name} onError={handleProductImageError} className="w-10 h-10 rounded-md object-cover bg-zinc-900" />
                              ) : (
                                <div className="w-10 h-10 rounded-md bg-zinc-900 flex items-center justify-center shrink-0"><Package size={16} className="text-gray-500" /></div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                                <p className="text-xs text-gray-400 truncate">
                                  {product.part_number || product.sku || product.motorcycle_model || product.category_name}
                                </p>
                              </div>
                              <div className="text-right text-sm font-bold text-orange-300 shrink-0">₱{Number(product.price || 0).toFixed(2)}<span className="block text-[10px] font-medium text-slate-300">{Number(product.stock_quantity || 0) > 0 ? 'In stock' : 'Out of stock'}</span></div>
                            </Link>
                          ))}
                        </div>
                        <Link to={`/shop?search=${encodeURIComponent(globalSearch.trim())}`} onClick={() => { searchTypedRef.current = false; setShowDropdown(false); updateShopParams({ search: globalSearch.trim() || null }); }} className="block w-full text-center text-xs font-bold text-red-500 py-3 bg-zinc-800/80 hover:bg-zinc-700/80 hover:text-orange-300 transition-colors uppercase tracking-wider shrink-0 border-t border-gray-700">
                          View All Results
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      <Modal isOpen={mobileOpen} onClose={() => setMobileOpen(false)} title="Menu" presentation="customer-top-sheet">
        <nav className="customer-top-menu" aria-label="Store navigation">
          {[
            { path: '/', label: 'Home', icon: Home },
            { path: '/shop', label: 'Shop', icon: ShoppingCart },
            ...(user ? [
              { path: '/orders', label: 'Orders', icon: Package },
              { path: '/messages', label: 'Messages', icon: MessageCircle },
              { path: '/profile', label: 'Profile', icon: User },
            ] : [{ path: '/login', label: 'Sign in', icon: User }]),
            { path: '/contact', label: 'Support', icon: Headphones },
          ].map(({ path, label, icon: Icon }) => <Link key={path} to={path} onClick={() => setMobileOpen(false)} aria-current={location.pathname === path || (path !== '/' && location.pathname.startsWith(`${path}/`)) ? 'page' : undefined}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>)}
        </nav>
        {user && <div className="customer-top-menu-footer"><button type="button" onClick={() => { setMobileOpen(false); setNotifOpen(true); }}><Bell size={18} aria-hidden="true" /> Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}</button><button type="button" onClick={() => { setMobileOpen(false); setShowLogoutConfirm(true); }}><LogOut size={18} aria-hidden="true" /> Sign out</button></div>}
      </Modal>

      {/* Cart Drawer */}
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Logout Confirmation Modal */}
      <ConfirmationDialog isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={() => { setShowLogoutConfirm(false); onLogout(); }} title="Sign out?" description="Sign out of your 10th West account?" confirmLabel="Sign out" />

    </>
  );
};

export default Navbar;


