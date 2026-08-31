import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/owner/AdminLayout';
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

const AdminDashboard = ({ user, onLogout }) => {
  const canAccessAdmin = ['owner', 'store_staff', 'admin'].includes(user?.role);
  const location = useLocation();
  const navigate = useNavigate();
  if (!canAccessAdmin) return <Navigate to="/login" replace />;

  const isStaff = user?.role === 'store_staff';
  const segment = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const aliases = { shipments: 'orders', waybills: 'orders', refunds: 'returns', settings: 'content' };
  const activeView = aliases[segment] || segment;
  const basePath = isStaff ? '/staff' : '/admin';
  const setActiveView = (view) => navigate(view === 'pos' ? '/pos' : `${basePath}/${view}`);

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
    dashboard: isStaff ? <StaffDashboardView user={user} onNavigate={setActiveView} /> : <DashboardView onNavigate={setActiveView} />,
    storefront: <StorefrontListingsView />, inventory: <InventoryView />, orders: <OrdersView />,
    customers: <CustomersView />, returns: <ReturnsView />, staff: <StaffView />,
    reviews: <ReviewsView />, reports: <ReportsView />, promotions: <PromotionsView />,
    banners: <BannersView />, content: <ContentView />, chat: <ChatView />,
  };
  if (isStaff && activeView === 'customers') return <Navigate to="/staff/dashboard" replace />;
  if (!views[activeView]) return <Navigate to={`${basePath}/dashboard`} replace />;
  return <AdminLayout activeView={activeView} onNavigate={setActiveView} onLogout={onLogout} user={user}>{views[activeView]}</AdminLayout>;
};

export default AdminDashboard;
