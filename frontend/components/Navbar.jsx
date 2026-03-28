import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Heart, User, Menu, X, ChevronDown, LogOut, Package, MapPin, RotateCcw, Shield, Monitor, Bell, Search, SlidersHorizontal, Grid3X3, List } from 'lucide-react';
import { getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, getAnnouncements, getProducts } from '../services/api';
import { Role } from '../types.js';
import { useCart } from '../context/CartContext';
import { useSocket } from '../context/SocketContext';
import CartDrawer from './CartDrawer';

const Navbar = ({ user, onLogout }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
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
  const moreMenuRef = useRef(null);

  const formatNotificationTime = (notification) => (
    notification.created_at || notification.published_at
      ? new Date(notification.created_at || notification.published_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : ''
  );

  const getNotificationSummary = (notification) => {
    if (notification.type === 'announcement') {
      return notification.message || '';
    }

    if (notification.message) {
      return notification.message;
    }

    if (notification.metadata?.status && notification.reference_type === 'order') {
      return `Order status: ${notification.metadata.status}`;
    }

    return '';
  };

  const userMenuItemClass = 'flex items-center gap-3 px-4 py-2.5 text-sm text-gray-100 hover:text-white hover:bg-zinc-800 focus-visible:bg-zinc-800 transition-all duration-200 ease-in-out';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setMoreMenuOpen(false);
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
    if (!globalSearch || globalSearch.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const results = await getProducts({ search: globalSearch.trim() });
        setSearchResults(results.slice(0, 5));
        setShowDropdown(true);
      } catch (err) {
        console.error("Search error:", err);
        setSearchError("Failed to fetch products");
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [globalSearch]);

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const [count, list, anns] = await Promise.all([
        getUnreadNotificationCount().catch(() => 0),
        getNotifications().catch(() => []),
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
    } catch { }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [user, refreshNotifications]);

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
      setNotifications((prev) => [notification, ...prev].slice(0, 10));
      if (notification.is_read === false || notification.is_read == null) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    const handleOrderEvent = () => {
      refreshNotifications();
    };

    on('notification', handleNotification);
    on('order:new', handleOrderEvent);
    on('order:updated', handleOrderEvent);

    return () => {
      off('notification', handleNotification);
      off('order:new', handleOrderEvent);
      off('order:updated', handleOrderEvent);
    };
  }, [user, connected, on, off, refreshNotifications]);

  useEffect(() => {
    const notifHandler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false);
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

  useEffect(() => {
    if (isShopRoute) {
      setGlobalSearch(searchParams.get('search') || '');
    } else if (isHomeRoute) {
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
    setGlobalSearch(value);
    
    if (isShopRoute) {
      updateShopParams({ search: value.trim() || null });
    }
  };

  const handleGlobalSearchSubmit = (e) => {
    e.preventDefault();
    const value = globalSearch.trim();

    if (isShopRoute) {
      updateShopParams({ search: value || null });
      return;
    }

    if (!value) {
      navigate('/shop');
      return;
    }

    navigate(`/shop?search=${encodeURIComponent(value)}`);
  };

  if (location.pathname === '/pos') return null;

  return (
    <>
      {/* Main navbar */}
      <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'backdrop-blur-xl shadow-lg' : 'bg-transparent shadow-none'}`}>
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Mobile menu button */}
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-white hover:bg-gray-100 rounded-lg transition-colors">
              <Menu size={22} />
            </button>

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
              <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm font-display">10</span>
              </div>
              <div className="hidden sm:block">
                <span className="font-display font-bold text-white text-lg leading-none">10TH WEST</span>
                <span className="block text-[9px] font-bold tracking-[0.3em] text-red-500 uppercase">Moto Parts</span>
              </div>
            </Link>

            {/* Desktop navigation - Center */}
            <nav className="hidden lg:flex items-center gap-0.5 ml-8 flex-1">
              <Link to="/" className={`px-7 py-2 rounded-lg text-sm font-semibold transition-colors duration-500 ease-in-out ${location.pathname === '/' ? 'text-red-600 border-b-2 border-red-600' : 'text-red-500 hover:text-red-600'}`}>
                Home
              </Link>
              <Link to="/shop" className={`px-7 py-2 rounded-lg text-sm font-semibold transition-colors duration-500 ease-in-out ${location.pathname === '/shop' ? 'text-red-600 border-b-2 border-red-600' : 'text-red-500 hover:text-red-600'}`}>
                Shop
              </Link>
              <div ref={moreMenuRef} className="relative">
                <button
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-300 ease-in-out flex items-center gap-1.5 ${location.pathname === '/faq' || location.pathname === '/contact' ? 'text-red-600 border-b-2 border-red-600' : 'text-red-500 hover:text-red-600'}`}
                >
                  More <ChevronDown size={16} className={`transition-transform duration-300 ease-in-out ${moreMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-900 rounded-2xl shadow-xl border border-gray-700 py-2 animate-fade-in z-50 transition-all duration-300 ease-in-out">
                    <Link to="/faq" className="block px-4 py-2.5 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 ease-in-out">
                      FAQ
                    </Link>
                    <Link to="/contact" className="block px-4 py-2.5 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 ease-in-out">
                      Contact
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
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors duration-200 cursor-pointer"
                  >
                    <Search size={18} />
                  </button>
                  <input
                    value={globalSearch}
                    onChange={handleSearchChange}
                    onFocus={() => { if(globalSearch.length >= 2) setShowDropdown(true); }}
                    placeholder="Search parts, brands..."
                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-700 bg-zinc-900 text-sm text-white placeholder-gray-400 focus:outline-none focus:bg-zinc-800 focus:ring-2 focus:ring-red-500/30 focus:border-red-300 transition-all duration-200"
                  />
                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-gray-700 rounded-xl shadow-2xl z-[100] max-h-[400px] flex flex-col overflow-hidden">
                      {isSearching ? (
                        <div className="p-4 text-center text-sm text-gray-400">Searching...</div>
                      ) : searchError ? (
                        <div className="p-4 text-center text-sm text-red-400">{searchError}</div>
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
                                  <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded-md object-cover bg-gray-900" />
                                ) : (
                                  <div className="w-10 h-10 rounded-md bg-gray-900 flex items-center justify-center shrink-0"><Package size={16} className="text-gray-500" /></div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                                  <p className="text-xs text-gray-400 truncate">{product.part_number || product.category_name}</p>
                                </div>
                                <div className="text-sm font-bold text-red-500 shrink-0">₱{product.price?.toFixed(2) || '0.00'}</div>
                              </Link>
                            ))}
                          </div>
                          <Link to={`/shop?search=${encodeURIComponent(globalSearch.trim())}`} onClick={() => { setShowDropdown(false); updateShopParams({ search: globalSearch.trim() || null }); }} className="block w-full text-center text-xs font-bold text-red-500 py-3 bg-zinc-800/80 hover:bg-zinc-700/80 hover:text-red-400 transition-colors uppercase tracking-wider shrink-0 border-t border-gray-700">
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
            <div className="flex items-center gap-1">
              {/* Notifications */}
              {user && (
                <div ref={notifRef} className="relative">
                  <button onClick={() => setNotifOpen(!notifOpen)} className="p-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors relative">
                    <Bell size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-96 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 animate-fade-in z-50">
                      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
                        <h3 className="font-bold text-white text-sm">Notifications</h3>
                        {unreadCount > 0 && (
                          <button onClick={handleMarkAllRead} className="text-xs text-red-600 hover:text-red-700 font-semibold hover:underline">Mark all read</button>
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-gray-400 text-sm">No notifications</div>
                        ) : (
                          notifications.map((n, i) => (
                          <button key={`${n.id || n.title}-${i}`} onClick={() => handleNotificationClick(n)} className={`w-full text-left px-4 py-3 hover:bg-gray-900 transition-all duration-150 border-b border-gray-50 ${!n.is_read ? 'bg-red-50/60' : ''}`}>
                              <div className="flex gap-3">
                                <div className="mt-0.5 shrink-0">
                                  {n.thumbnail_url ? (
                                    <img src={n.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-900 border border-gray-700" />
                                  ) : n.type === 'announcement' ? (
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                                      <Bell size={16} />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-sm ${!n.is_read ? 'font-bold text-white' : 'font-medium text-gray-700'}`}>{n.title || n.message}</p>
                                  {getNotificationSummary(n) && <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{getNotificationSummary(n)}</p>}
                                  <p className="text-xs text-gray-400 mt-1">{formatNotificationTime(n)}</p>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Wishlist */}
              {user && (
                <Link to="/wishlist" className="p-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors hidden sm:flex">
                  <Heart size={20} />
                </Link>
              )}

              {/* Cart */}
              <button onClick={() => setCartOpen(true)} className="p-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors relative">
                <ShoppingCart size={20} />
                {itemCount > 0 && (
                  <span className="absolute top-1 right-1 bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              {/* User menu */}
              {user ? (
                <div ref={userMenuRef} className="relative">
                  <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="p-2 text-red-500 hover:text-red-400 ml-2 flex items-center gap-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <div className="w-8 h-8 bg-gradient-to-br from-red-100 to-red-200 text-red-600 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden md:block text-sm font-semibold text-gray-100 max-w-20 truncate">{user.name.split(' ')[0]}</span>
                    <ChevronDown size={14} className="hidden md:block text-gray-300" />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-950/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-700 py-2 animate-fade-in">
                      <div className="px-4 py-3 border-b border-zinc-700 mb-1">
                        <p className="text-sm font-bold text-white truncate">{user.name}</p>
                        <p className="text-xs text-gray-300 truncate">{user.email}</p>
                      </div>
                      <Link to="/profile" className={userMenuItemClass}><User size={16} className="text-red-400" /> My Profile</Link>
                      <Link to="/orders" className={userMenuItemClass}><Package size={16} className="text-red-400" /> My Orders</Link>
                      <Link to="/wishlist" className={userMenuItemClass}><Heart size={16} className="text-red-400" /> Wishlist</Link>
                      <Link to="/addresses" className={userMenuItemClass}><MapPin size={16} className="text-red-400" /> Addresses</Link>
                      <Link to="/my-returns" className={userMenuItemClass}><RotateCcw size={16} className="text-red-400" /> Returns</Link>
                      {(user?.role === Role.OWNER || user?.role === Role.STORE_STAFF) && (
                        <>
                          <div className="border-t border-zinc-700 mt-1 pt-1" />
                          <Link to="/admin" className={userMenuItemClass}><Shield size={16} className="text-red-400" /> Admin Panel</Link>
                          <Link to="/pos" className={userMenuItemClass}><Monitor size={16} className="text-red-400" /> POS Terminal</Link>
                        </>
                      )}
                      <div className="border-t border-zinc-700 mt-1 pt-1">
                        <button onClick={() => setShowLogoutConfirm(true)} className={`${userMenuItemClass} w-full`}>
                          <LogOut size={16} className="text-red-400" /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="ml-3 px-5 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>

      </header>

      {/* Mobile search bar */}
      {shouldShowGlobalSearch && (
        <div className={`lg:hidden sticky top-16 z-40 transition-all duration-300 ${scrolled ? 'backdrop-blur-xl' : 'backdrop-blur'} bg-transparent`}>
          <div className="max-w-7xl mx-auto px-4 py-2 flex justify-center">
            <form onSubmit={handleGlobalSearchSubmit} className="flex items-center gap-2 w-full" ref={mobileSearchDropdownRef}>
              <div className="relative flex-1">
                <button
                  type="submit"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors duration-200 cursor-pointer"
                >
                  <Search size={18} />
                </button>
                <input
                  value={globalSearch}
                  onChange={handleSearchChange}
                  onFocus={() => { if(globalSearch.length >= 2) setShowDropdown(true); }}
                  placeholder="Search parts..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-700 bg-zinc-900 text-sm text-gray-700 focus:outline-none focus:bg-zinc-800 focus:ring-2 focus:ring-red-500/30 focus:border-red-300 transition-all duration-200"
                />
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-gray-700 rounded-xl shadow-2xl z-[100] max-h-[350px] flex flex-col overflow-hidden">
                    {isSearching ? (
                      <div className="p-4 text-center text-sm text-gray-400">Searching...</div>
                    ) : searchError ? (
                      <div className="p-4 text-center text-sm text-red-400">{searchError}</div>
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
                                <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded-md object-cover bg-zinc-900" />
                              ) : (
                                <div className="w-10 h-10 rounded-md bg-zinc-900 flex items-center justify-center shrink-0"><Package size={16} className="text-gray-500" /></div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                                <p className="text-xs text-gray-400 truncate">{product.part_number || product.category_name}</p>
                              </div>
                              <div className="text-sm font-bold text-red-500 shrink-0">₱{product.price?.toFixed(2) || '0.00'}</div>
                            </Link>
                          ))}
                        </div>
                        <Link to={`/shop?search=${encodeURIComponent(globalSearch.trim())}`} onClick={() => { setShowDropdown(false); updateShopParams({ search: globalSearch.trim() || null }); }} className="block w-full text-center text-xs font-bold text-red-500 py-3 bg-zinc-800/80 hover:bg-zinc-700/80 hover:text-red-400 transition-colors uppercase tracking-wider shrink-0 border-t border-gray-700">
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-zinc-900 shadow-2xl animate-fade-in overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <div className="w-8 h-8 bg-gradient-to-br from-red-400 to-red-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-sm font-display">10</span>
                </div>
                <span className="font-display font-bold text-white">10TH WEST</span>
              </Link>
              <button onClick={() => setMobileOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X size={20} /></button>
            </div>
            {user && (
              <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-red-50 to-pink-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-100 to-red-200 text-red-600 rounded-lg flex items-center justify-center font-bold">{user.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="font-semibold text-white text-sm">{user.name}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
            <nav className="p-4 space-y-1">
              <Link to="/" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">Home</Link>
              <Link to="/shop" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">Shop All</Link>
              <div className="border-t border-gray-700 my-2" />
              <Link to="/faq" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">FAQ</Link>
              <Link to="/contact" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">Contact</Link>
              {user && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  <Link to="/profile" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">My Profile</Link>
                  <Link to="/orders" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">My Orders</Link>
                  <Link to="/wishlist" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">Wishlist</Link>
                  <Link to="/addresses" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">Address Book</Link>
                  <Link to="/my-returns" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">My Returns</Link>
                </>
              )}
              {(user?.role === Role.OWNER || user?.role === Role.STORE_STAFF) && (
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">Admin Panel</Link>
              )}
              {(user?.role === Role.OWNER || user?.role === Role.STORE_STAFF) && (
                <Link to="/pos" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 ease-in-out">POS Terminal</Link>
              )}
            </nav>
            <div className="p-4 border-t border-gray-700">
              {user ? (
                <button onClick={() => { onLogout(); setMobileOpen(false); }} className="w-full px-4 py-2.5 border border-gray-700 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-900 transition-all duration-200 flex items-center justify-center gap-2">
                  <LogOut size={16} /> Sign Out
                </button>
              ) : (
                <div className="space-y-2">
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="block w-full px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg text-sm font-semibold text-center hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-md">Sign In</Link>
                  <Link to="/register" onClick={() => setMobileOpen(false)} className="block w-full px-4 py-2.5 border border-gray-700 text-gray-700 rounded-lg text-sm font-semibold text-center hover:bg-gray-900 transition-all duration-200">Create Account</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Cart Drawer */}
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl w-96 border border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-gradient-to-br from-red-50 to-pink-50 p-3 rounded-2xl">
                <LogOut className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">Sign Out?</h3>
                <p className="text-gray-400 font-semibold text-sm mt-1">Confirm to logout</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to sign out of your account?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-2xl font-bold transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); onLogout(); }}
                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl hover:from-red-600 hover:to-red-700 font-bold shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;


