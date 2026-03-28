import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Boxes, ShoppingCart, Monitor,
  RotateCcw, UserCog, BarChart3, Users,
  LogOut, Bell, Search, Menu, X,
  ChevronLeft, ExternalLink, Wifi, WifiOff, Image, Tag, Newspaper,
  Settings, CircleHelp, House,
  AlertTriangle, CheckCircle
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, logoutApi } from '../../services/api';

const createNavItems = (badges = {}) => [
  // Core
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes, badge: badges.lowStock },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, badge: badges.pendingOrders },
  { id: 'customers', label: 'Customers', icon: Users },
  // Staff-only
  { id: 'pos', label: 'POS Terminal', icon: Monitor, external: '#/pos' },
  { id: 'returns', label: 'Returns', icon: RotateCcw, badge: badges.pendingReturns },
  // Owner: Staff & Reports
  { id: 'staff', label: 'Staff', icon: UserCog, divider: true },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  // Owner: Marketing & Content
  { id: 'promotions', label: 'Promotions', icon: Tag, divider: true },
  { id: 'banners', label: 'Banners', icon: Image },
  { id: 'content', label: 'Content', icon: Newspaper },
];

// Nav items store_staff can see
const STORE_STAFF_NAV = ['inventory', 'orders', 'pos', 'returns'];

// Nav items owner/admin can see (business management only)
const OWNER_NAV = [
  'dashboard', 'products', 'inventory', 'orders', 'customers',
  'returns',
  'staff', 'reports',
  'promotions', 'banners', 'content'
];

// Only owner/store_staff should render admin navigation here.

const AdminLayout = ({ activeView, onNavigate, onLogout: parentLogout, badges = {}, user, children }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { connected, on, off } = useSocket();

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  const formatNotificationTime = (notification) => (
    notification.created_at
      ? new Date(notification.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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

    if (normalized.message) return normalized.message;
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

  const getNotificationTypeLabel = (notification) => {
    const normalized = normalizeIncomingNotification(notification);
    if (normalized.reference_type === 'order' || normalized.type === 'order.status') return 'Order';
    if (normalized.type === 'return.status') return 'Return';
    return 'Update';
  };

  const refreshNotifications = useCallback(async () => {
    try {
      const [count, list] = await Promise.all([
        getUnreadNotificationCount().catch(() => 0),
        getNotifications().catch(() => []),
      ]);
      setUnreadCount(count || 0);
      setNotifications(list || []);
    } catch {}
  }, []);

  // Poll notifications
  useEffect(() => {
    if (!user) return;
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [user, refreshNotifications]);

  // Socket listeners for real-time
  useEffect(() => {
    if (!user || !connected) return;
    const handleRefresh = () => refreshNotifications();
    const handleNotification = (notification) => {
      if (notification?.user_id && notification.user_id !== user.id) return;
      handleRefresh();
    };
    on('notification', handleNotification);
    on('order:new', handleRefresh);
    on('order:updated', handleRefresh);
    on('inventory:low-stock', handleRefresh);
    return () => {
      off('notification', handleNotification);
      off('order:new', handleRefresh);
      off('order:updated', handleRefresh);
      off('inventory:low-stock', handleRefresh);
    };
  }, [user, connected, on, off, refreshNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) { console.error(e); }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) { console.error(e); }
  };

  const handleNotificationClick = async (notification) => {
    await handleMarkRead(notification.id);
    setNotifOpen(false);

    const refType = notification.reference_type || notification.type;
    if (refType === 'order') onNavigate('orders');
    else if (refType === 'product' || refType === 'inventory') onNavigate('inventory');
    else if (refType === 'return') onNavigate('returns');
  };

  const getNotifIcon = (type) => {
    if (type?.includes('order')) return <ShoppingCart size={14} />;
    if (type?.includes('stock') || type?.includes('inventory')) return <AlertTriangle size={14} />;
    if (type?.includes('return')) return <RotateCcw size={14} />;
    return <Bell size={14} />;
  };

  const getNotifColor = (type) => {
    if (type?.includes('low_stock')) return 'bg-red-50 text-red-500';
    if (type?.includes('order')) return 'bg-blue-50 text-blue-500';
    if (type?.includes('return')) return 'bg-yellow-50 text-yellow-500';
    return 'bg-red-500/10 text-red-500';
  };
  const allNavItems = createNavItems(badges);
  const navItems = user?.role === 'store_staff'
    ? allNavItems.filter(item => STORE_STAFF_NAV.includes(item.id))
    : user?.role === 'owner' || user?.role === 'admin'
      ? allNavItems.filter(item => OWNER_NAV.includes(item.id))
      : [];

  const handleNav = (item) => {
    if (item.external) { window.open(item.external, '_blank'); }
    else { onNavigate(item.id); }
    setMobileOpen(false);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    try {
      await logoutApi();
    } catch (e) {
      // Ignore logout API errors
    }
    localStorage.removeItem('shopCoreUser');
    localStorage.removeItem('shopCoreToken');
    setShowLogoutConfirm(false);
    // Call parent logout handler to clear React user state
    if (parentLogout) {
      parentLogout();
    }
    navigate('/login');
  };

  const SidebarContent = ({ mobile = false }) => (
    <div className="h-full flex flex-col rounded-2xl border border-white/5 bg-gradient-to-b from-[#1a1d23] to-[#111318] shadow-[0_18px_45px_rgba(0,0,0,0.5)] overflow-hidden">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#ff5f3c] flex items-center justify-center flex-shrink-0 shadow-[0_8px_16px_rgba(255,95,60,0.35)]">
            <House size={14} className="text-white" />
          </div>
          {(!collapsed || mobile) && (
            <div>
              <h1 className="font-display font-bold text-sm text-white leading-none">10TH WEST</h1>
              <p className="text-[10px] text-gray-400 font-medium tracking-wide">Metric Flow</p>
            </div>
          )}
        </div>
        {mobile && <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <React.Fragment key={item.id}>
              {item.divider && idx > 0 && <div className="my-2 border-t border-white/10" />}
              <button
                onClick={() => handleNav(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all
                  ${isActive ? 'bg-[#2a2d34] text-[#ff6b47] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-gray-300 hover:bg-[#20242c] hover:text-white'}
                  ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
                title={collapsed && !mobile ? item.label : undefined}
              >
                <Icon size={17} className={`flex-shrink-0 ${isActive ? 'text-[#ff6b47]' : 'text-gray-400'}`} />
                {(!collapsed || mobile) && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge ? <span className="min-w-[20px] h-5 bg-[#ff5f3c] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">{item.badge}</span> : null}
                    {item.external && <ExternalLink size={12} className="text-gray-400" />}
                  </>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Bottom utility */}
      <div className="px-2 pb-2 space-y-1 flex-shrink-0">
        <button
          type="button"
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-gray-300 hover:bg-[#20242c] hover:text-white ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
        >
          <Settings size={17} className="flex-shrink-0 text-gray-400" />
          {(!collapsed || mobile) && <span className="flex-1 text-left">Settings</span>}
        </button>
        <button
          type="button"
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-gray-300 hover:bg-[#20242c] hover:text-white ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
        >
          <CircleHelp size={17} className="flex-shrink-0 text-gray-400" />
          {(!collapsed || mobile) && <span className="flex-1 text-left">Help Center</span>}
        </button>
      </div>

      {/* User */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-[#ff5f3c]/20 text-[#ff6b47] rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Admin'}</p>
              <p className="text-[10px] text-gray-400 capitalize">{user?.role}</p>
            </div>
          )}
          <button onClick={handleLogout} className="text-gray-300 hover:text-[#ff6b47] transition-colors flex-shrink-0" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-[#0b0d11] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`${collapsed ? 'w-[92px]' : 'w-[272px]'} bg-[#0b0d11] p-3 flex-col transition-all duration-200 hidden lg:flex`}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-72 bg-[#0b0d11] p-3 shadow-2xl z-50 flex flex-col">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      {/* Main */}  
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14  border-b border-gray-700 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-gray-400 hover:text-gray-600">
              <Menu size={20} />
            </button>
            <h2 className="font-display font-semibold text-white text-sm capitalize">{activeView === 'pos' ? 'POS Terminal' : activeView}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${connected ? 'bg-green-50 text-green-600' : 'bg-red-500/10 text-red-500'}`} title={connected ? 'Real-time connected' : 'Reconnecting...'}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
            </div>
            <div className="relative hidden sm:block">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." className="pl-8 pr-3 py-1.5 border border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300 w-44" />
            </div>
            <button className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" onClick={() => setNotifOpen(!notifOpen)}>
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500/100 text-white text-[9px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {/* Notification dropdown */}
            {notifOpen && (
              <div ref={notifRef} className="absolute right-4 top-12 w-96 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                  <h3 className="font-semibold text-white text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-red-500 hover:text-orange-600 font-medium">Mark all read</button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      <Bell size={24} className="mx-auto mb-2 opacity-30" />
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const n = normalizeIncomingNotification(notification);
                      const title = getNotificationTitle(n);
                      const summary = getNotificationSummary(n);
                      const typeLabel = getNotificationTypeLabel(n);

                      return (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left px-4 py-3.5 hover:bg-gray-900 transition-colors border-b border-gray-700 ${!n.is_read ? 'bg-red-500/10' : ''}`}
                      >
                        <div className="flex items-start gap-3.5">
                          {n.thumbnail_url ? (
                            <img src={n.thumbnail_url} alt="" className="mt-0.5 shrink-0 w-12 h-12 rounded-xl object-cover bg-gray-900 border border-gray-700 shadow-sm" />
                          ) : (
                            <div className={`mt-0.5 shrink-0 w-10 h-10 rounded-xl border border-gray-700 flex items-center justify-center ${getNotifColor(n.type)}`}>
                              {getNotifIcon(n.type)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm leading-5 ${!n.is_read ? 'font-semibold text-white' : 'font-medium text-gray-100'}`}>{title}</p>
                                {summary && <p className="mt-1 text-xs leading-5 text-gray-300 line-clamp-2">{summary}</p>}
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
                                  <span className="rounded-full border border-gray-600 bg-zinc-900 px-2 py-0.5 font-medium text-gray-300">{typeLabel}</span>
                                  <span>{formatNotificationTime(n)}</span>
                                </div>
                              </div>
                              {!n.is_read && <div className="mt-1.5 w-2.5 h-2.5 bg-red-500 rounded-full shrink-0" />}
                            </div>
                          </div>
                        </div>
                      </button>
                    )})
                  )}
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl w-96 border border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-red-500/10 p-3 rounded-2xl">
                <LogOut className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">Sign Out?</h3>
                <p className="text-gray-400 font-medium text-sm mt-1">Confirm to logout</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to sign out of your admin account?
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
                className="flex-1 py-3 bg-red-500/100 text-white rounded-2xl hover:bg-red-600 font-bold shadow-lg hover:shadow-xl transition-all"
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

export default AdminLayout;




