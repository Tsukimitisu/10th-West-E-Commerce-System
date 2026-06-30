import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Image,
  LayoutDashboard,
  MessageCircle,
  Monitor,
  Newspaper,
  Package,
  RotateCcw,
  ShoppingCart,
  Star,
  Tag,
  UserCog,
  Users,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import {
  getMyPermissions,
  getNotifications,
  getUnreadNotificationCount,
  logoutApi,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/api';
import { clearCurrentAuthUser } from '../../services/authSession';
import OperationsShell from '../operations/OperationsShell';

const createNavItems = (badges = {}) => [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, badge: badges.pendingOrders, group: 'Sales', permission: 'orders.view' },
  { id: 'pos', label: 'Point of sale', icon: Monitor, route: '/pos', group: 'Sales', permission: 'pos.access' },
  { id: 'products', label: 'Products', icon: Package, group: 'Catalog', permission: 'products.view' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, badge: badges.lowStock, group: 'Catalog', permission: 'inventory.view' },
  { id: 'promotions', label: 'Promotions', icon: Tag, group: 'Catalog', permission: 'promotions.manage' },
  { id: 'customers', label: 'Customers', icon: Users, group: 'Customers', permission: 'customers.view' },
  { id: 'chat', label: 'Conversations', icon: MessageCircle, group: 'Customers', permission: 'chat.view' },
  { id: 'reviews', label: 'Reviews', icon: Star, group: 'Customers', permission: 'reviews.moderate' },
  { id: 'returns', label: 'Returns & refunds', icon: RotateCcw, badge: badges.pendingReturns, group: 'Operations', permission: 'returns.view' },
  { id: 'staff', label: 'Staff & roles', icon: UserCog, group: 'Operations', permission: 'staff.view' },
  { id: 'reports', label: 'Reports', icon: BarChart3, group: 'Insights', permission: 'reports.view' },
  { id: 'banners', label: 'Banners', icon: Image, group: 'Storefront' },
  { id: 'content', label: 'Content', icon: Newspaper, group: 'Storefront' },
];

const STAFF_NAV = ['dashboard', 'orders', 'pos', 'products', 'inventory', 'returns', 'chat'];
const ADMIN_NAV = [
  'dashboard', 'orders', 'pos', 'products', 'inventory', 'promotions',
  'customers', 'chat', 'reviews', 'returns', 'staff', 'reports', 'banners', 'content',
];

const parseNotification = (notification) => {
  let metadata = notification?.metadata || null;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = null; }
  }
  return {
    ...notification,
    metadata,
    thumbnail_url: notification?.thumbnail_url || metadata?.thumbnail_url || metadata?.product_image || null,
  };
};

const notificationTitle = (notification) => {
  if (notification.title) return notification.title;
  if (notification.reference_type === 'order' || notification.type?.includes('order')) {
    const number = notification.metadata?.order_number || notification.reference_id;
    return number ? `Order #${String(number).padStart(4, '0')} update` : 'Order update';
  }
  if (notification.type?.includes('return')) return 'Return request update';
  return 'Operations update';
};

const AdminLayout = ({ activeView, onNavigate, onLogout: parentLogout, badges = {}, user, children }) => {
  const navigate = useNavigate();
  const { connected, on, off } = useSocket();
  const [permissions, setPermissions] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef(null);

  const refreshNotifications = useCallback(async () => {
    const [count, list] = await Promise.all([
      getUnreadNotificationCount().catch(() => 0),
      getNotifications().catch(() => []),
    ]);
    setUnreadCount(Number(count || 0));
    setNotifications((Array.isArray(list) ? list : []).map(parseNotification));
  }, []);

  useEffect(() => {
    let active = true;
    getMyPermissions()
      .then((items) => { if (active) setPermissions(new Set(items)); })
      .catch(() => { if (active) setPermissions(new Set()); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return undefined;
    refreshNotifications();
    const interval = window.setInterval(refreshNotifications, 30000);
    return () => window.clearInterval(interval);
  }, [refreshNotifications, user]);

  useEffect(() => {
    if (!user || !connected) return undefined;
    const refresh = () => refreshNotifications();
    on('notification', refresh);
    on('order:new', refresh);
    on('order:updated', refresh);
    on('inventory:low-stock', refresh);
    return () => {
      off('notification', refresh);
      off('order:new', refresh);
      off('order:updated', refresh);
      off('inventory:low-stock', refresh);
    };
  }, [connected, off, on, refreshNotifications, user]);

  useEffect(() => {
    const close = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const privileged = ['owner', 'admin'].includes(user?.role);
  const allowedIds = privileged ? ADMIN_NAV : STAFF_NAV;
  const navItems = createNavItems(badges).filter((item) => (
    allowedIds.includes(item.id)
    && (!item.permission || privileged || permissions?.has(item.permission))
  ));

  useEffect(() => {
    if (!permissions || navItems.length === 0) return;
    if (!navItems.some((item) => item.id === activeView)) onNavigate(navItems[0].id);
  }, [activeView, navItems, onNavigate, permissions]);

  const handleNavigate = (item) => {
    if (item.route) navigate(item.route);
    else onNavigate(item.id);
  };

  const handleLogout = async () => {
    await logoutApi().catch(() => {});
    clearCurrentAuthUser();
    parentLogout?.();
    navigate('/login');
  };

  const markAllRead = async () => {
    await markAllNotificationsRead().catch(() => {});
    setUnreadCount(0);
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
  };

  const openNotification = async (notification) => {
    if (!notification.is_read) {
      await markNotificationRead(notification.id).catch(() => {});
      setUnreadCount((count) => Math.max(0, count - 1));
      setNotifications((items) => items.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
    }
    setNotificationsOpen(false);
    const type = `${notification.reference_type || ''} ${notification.type || ''}`;
    if (type.includes('order')) onNavigate('orders');
    else if (type.includes('return')) onNavigate('returns');
    else if (type.includes('product') || type.includes('inventory')) onNavigate('inventory');
  };

  const currentTitle = navItems.find((item) => item.id === activeView)?.label || 'Operations';
  const isStaff = user?.role === 'store_staff';

  const notificationActions = (
    <div className="relative" ref={notificationRef}>
      <button
        type="button"
        onClick={() => setNotificationsOpen((open) => !open)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div className="absolute right-0 top-11 z-50 w-[min(92vw,400px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Notifications</p>
              <p className="text-[11px] text-slate-500">{unreadCount ? `${unreadCount} unread` : 'You are up to date'}</p>
            </div>
            {unreadCount > 0 && <button type="button" onClick={markAllRead} className="text-xs font-semibold text-orange-700 hover:text-orange-800">Mark all read</button>}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Bell size={24} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No notifications</p>
                <p className="mt-1 text-xs text-slate-500">Operational updates will appear here.</p>
              </div>
            ) : notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3.5 text-left hover:bg-slate-50 ${notification.is_read ? '' : 'bg-orange-50/50'}`}
              >
                {notification.thumbnail_url ? (
                  <img src={notification.thumbnail_url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    {notification.type?.includes('stock') ? <AlertTriangle size={16} /> : <Bell size={16} />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{notificationTitle(notification)}</span>
                  {notification.message && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">{notification.message}</span>}
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {notification.created_at ? new Date(notification.created_at).toLocaleString() : ''}
                  </span>
                </span>
                {!notification.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <OperationsShell
      activeId={activeView}
      navItems={navItems}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
      user={user}
      connected={connected}
      title={currentTitle}
      contextLabel={isStaff ? 'Store operations workspace' : 'Commerce management workspace'}
      headerActions={notificationActions}
    >
      {children}
    </OperationsShell>
  );
};

export default AdminLayout;
