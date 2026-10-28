import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Boxes,
  PackageSearch,
  Image,
  LayoutDashboard,
  MessageCircle,
  Monitor,
  Newspaper,
  RotateCcw,
  ShoppingCart,
  Store,
  Star,
  Tag,
  UserCog,
  Users,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import {
  getMyPermissions,
  logoutApi,
} from '../../services/api';
import { clearCurrentAuthUser } from '../../services/authSession';
import OperationsShell from '../operations/OperationsShell';
import WorkspaceNotificationBell from '../operations/WorkspaceNotificationBell.jsx';

const createNavItems = (badges = {}) => [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, badge: badges.pendingOrders, group: 'Commerce', permission: 'orders.view' },
  { id: 'returns', label: 'Returns & refunds', icon: RotateCcw, badge: badges.pendingReturns, group: 'Commerce', permission: 'returns.view' },
  { id: 'customers', label: 'Customers', icon: Users, group: 'Commerce', permission: 'customers.view' },
  { id: 'reviews', label: 'Reviews', icon: Star, group: 'Commerce', permission: 'reviews.moderate' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, badge: badges.lowStock, group: 'Catalog', permission: 'inventory.view' },
  { id: 'product-items', label: 'Product Items', icon: PackageSearch, group: 'Catalog', parentId: 'inventory', permission: 'inventory.view' },
  { id: 'storefront', label: 'Storefront Listings', icon: Store, group: 'Catalog', permission: 'products.view' },
  { id: 'promotions', label: 'Promotions', icon: Tag, group: 'Catalog', permission: 'promotions.manage' },
  { id: 'banners', label: 'Banners', icon: Image, group: 'Catalog' },
  { id: 'pos', label: 'Point of sale', icon: Monitor, route: '/pos', group: 'Sales', permission: 'pos.access' },
  { id: 'offline-pos-devices', label: 'Offline POS Devices', icon: Monitor, group: 'Sales', managementOnly:true },
  { id: 'reports', label: 'Reports', icon: BarChart3, group: 'Sales', permission: 'reports.view' },
  { id: 'content', label: 'Content & settings', icon: Newspaper, group: 'Content' },
  { id: 'chat', label: 'Conversations', icon: MessageCircle, group: 'Communication', permission: 'chat.view' },
  { id: 'staff', label: 'Staff & roles', icon: UserCog, group: 'Settings', permission: 'staff.view' },
];

const ADMIN_NAV = [
  'dashboard', 'orders', 'pos', 'offline-pos-devices', 'inventory', 'product-items', 'storefront', 'promotions',
  'customers', 'chat', 'reviews', 'returns', 'staff', 'reports', 'banners', 'content',
];

const AdminLayout = ({ activeView, onNavigate, onLogout: parentLogout, badges = {}, user, children }) => {
  const navigate = useNavigate();
  const { connected } = useSocket();
  const [permissions, setPermissions] = useState(null);
  useEffect(() => {
    let active = true;
    getMyPermissions()
      .then((items) => { if (active) setPermissions(new Set(items)); })
      .catch(() => { if (active) setPermissions(new Set()); });
    return () => { active = false; };
  }, [user?.id]);

  const privileged = ['owner', 'admin'].includes(user?.role);
  const staffSelfService = user?.role === 'store_staff' ? [
    { id: 'notifications', label: 'Notifications', icon: Bell, group: 'Communication', selfService: true },
    { id: 'account', label: 'Account & security', icon: UserCog, group: 'Account', selfService: true },
  ] : [];
  const ownerSelfService = privileged ? [
    { id: 'notifications', label: 'Notifications', icon: Bell, group: 'Communication', selfService: true },
    { id: 'account', label: 'Account & Security', icon: UserCog, group: 'Account', selfService: true },
  ] : [];
  const navItems = [...createNavItems(badges), ...staffSelfService, ...ownerSelfService].filter((item) => (
    (!item.managementOnly || privileged) &&
    (privileged ? ADMIN_NAV.includes(item.id) || item.selfService : (item.id === 'dashboard' || item.selfService || Boolean(item.permission)))
    && (!item.permission || privileged || permissions?.has(item.permission))
    && !(user?.role === 'store_staff' && item.id === 'customers')
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

  const presentedNav = user?.role === 'store_staff' ? navItems.map(item => ({ ...item, group: item.id === 'dashboard' ? 'Workspace' : ['orders', 'returns'].includes(item.id) ? 'Fulfillment' : ['inventory', 'product-items', 'storefront'].includes(item.id) ? 'Parts counter' : ['chat', 'notifications'].includes(item.id) ? 'Communication' : item.id === 'account' ? 'Account' : 'Tools' })) : navItems;

  const ownerOrder = ['dashboard','orders','pos','offline-pos-devices','returns','customers','inventory','product-items','storefront','banners','promotions','reviews','content','reports','chat','notifications','staff','account'];
  const ownerGroups = { dashboard: 'Overview', orders: 'Sales', pos: 'Sales', returns: 'Sales', customers: 'Sales', inventory: 'Catalog', 'product-items': 'Catalog', storefront: 'Catalog', banners: 'Marketing', promotions: 'Marketing', reviews: 'Marketing', content: 'Marketing', reports: 'Insights', chat: 'Communication', notifications: 'Communication', staff: 'Account', account: 'Account' };
  const workspaceNav = privileged ? navItems.map(item => ({ ...item, group: ownerGroups[item.id] || item.group, ...(item.id === 'banners' ? { label: 'Hero Carousel', route: '/admin/hero-carousel' } : {}) })).sort((a,b) => ownerOrder.indexOf(a.id) - ownerOrder.indexOf(b.id)) : presentedNav;
  const currentTitle = workspaceNav.find((item) => item.id === activeView)?.label || 'Operations';
  const isStaff = user?.role === 'store_staff';

  return (
    <OperationsShell
      activeId={activeView}
      navItems={workspaceNav}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
      user={user}
      connected={connected}
      title={currentTitle}
      contextLabel={isStaff ? 'Store operations workspace' : 'Commerce management workspace'}
      headerActions={<WorkspaceNotificationBell user={user} />}
    >
      {children}
    </OperationsShell>
  );
};

export default AdminLayout;
