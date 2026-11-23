import React, { lazy, Suspense } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/owner/AdminLayout';
import OfflinePosDevicesView from './OfflinePosDevicesView.jsx';
import DashboardView from './DashboardView';
import InventoryView from './InventoryView';
import OrdersView from './OrdersView';
import CustomersView from './CustomersView';
import ReturnsView from './ReturnsView';
import StaffView from './StaffView';
import ReviewsView from './ReviewsView';
import ReportsView from './ReportsView';
import BannersView from './BannersView';
import PromotionsView from './PromotionsView';
import ContentView from './ContentView';
import ChatView from './ChatView';
import StaffDashboardView from '../staff/StaffDashboardView';
import StorefrontListingsView from './StorefrontListingsView';
import InventoryProductItemsView from './InventoryProductItemsView';
const StaffAccountView = lazy(() => import('../staff/StaffAccountView'));
const StaffNotificationsView = lazy(() => import('../staff/StaffNotificationsView'));
const OwnerAccountView = lazy(() => import('./OwnerAccountView'));
const WorkspaceNotifications = lazy(() => import('../../components/operations/WorkspaceNotifications'));

const AdminDashboard = ({ user, onLogout }) => {
  const canAccessAdmin = ['owner', 'store_staff', 'admin'].includes(user?.role);
  const location = useLocation();
  const navigate = useNavigate();
  if (!canAccessAdmin) return <Navigate to="/login" replace />;

  const isStaff = user?.role === 'store_staff';
  const segment = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const aliases = { shipments: 'orders', waybills: 'orders', refunds: 'returns', settings: 'content', 'hero-carousel': 'banners' };
  const activeView = segment === 'inventory' && location.pathname.endsWith('/inventory/product-items')
    ? 'product-items' : aliases[segment] || segment;
  const basePath = isStaff ? '/staff' : '/admin';
  const setActiveView = (view) => navigate(view === 'pos' ? '/pos' : view === 'product-items'
    ? `${basePath}/inventory/product-items` : !isStaff && view === 'banners' ? '/admin/hero-carousel' : `${basePath}/${view}`);

  if (!isStaff && segment === 'banners') return <Navigate to="/admin/hero-carousel" replace />;

  if (['products', 'categories', 'variants'].includes(segment)) {
    return (
      <Navigate
        to={`${basePath}/inventory`}
        replace
        state={{ catalogNotice: 'Product management is now handled through Inventory. Use Storefront Listings to publish items online.' }}
      />
    );
  }

  const views = {
    dashboard: isStaff ? <StaffDashboardView user={user} onNavigate={setActiveView} /> : <DashboardView user={user} onNavigate={setActiveView} />,
    storefront: <StorefrontListingsView />, inventory: <InventoryView user={isStaff ? user : undefined} />,
    'product-items': <InventoryProductItemsView />, orders: <OrdersView />,
    customers: <CustomersView />, returns: <ReturnsView />, staff: <StaffView />,
    reviews: <ReviewsView />, reports: <ReportsView />, promotions: <PromotionsView />,
    banners: <BannersView />, content: <ContentView />, chat: <ChatView />,
    ...(isStaff ? {
      account: <Suspense fallback={<p role="status">Loading staff account…</p>}><StaffAccountView user={user} /></Suspense>,
      notifications: <Suspense fallback={<p role="status">Loading notifications…</p>}><StaffNotificationsView onNavigate={setActiveView} /></Suspense>,
    } : {
      'offline-pos-devices': <OfflinePosDevicesView user={user} />,
      account: <Suspense fallback={<p role="status">Loading Owner account…</p>}><OwnerAccountView user={user} /></Suspense>,
      notifications: <Suspense fallback={<p role="status">Loading notifications…</p>}><WorkspaceNotifications variant="owner" onNavigate={setActiveView} /></Suspense>,
    }),
  };
  if (isStaff && activeView === 'customers') return <Navigate to="/staff/dashboard" replace />;
  if (!views[activeView]) return <Navigate to={`${basePath}/dashboard`} replace />;
  return <AdminLayout activeView={activeView} onNavigate={setActiveView} onLogout={onLogout} user={user}>{views[activeView]}</AdminLayout>;
};

export default AdminDashboard;
