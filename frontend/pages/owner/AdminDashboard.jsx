import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/owner/AdminLayout';
import DashboardView from './DashboardView';
import ProductsView from './ProductsView';
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

const AdminDashboard = ({ user, onLogout }) => {
  const canAccessAdmin = ['owner', 'store_staff', 'admin'].includes(user?.role);
  const location = useLocation();
  const navigate = useNavigate();
  if (!canAccessAdmin) return <Navigate to="/login" replace />;

  const isStaff = user?.role === 'store_staff';
  const aliases = { categories: 'products', variants: 'products', shipments: 'orders', waybills: 'orders', refunds: 'returns', settings: 'content' };
  const segment = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const activeView = aliases[segment] || segment;
  const basePath = isStaff ? '/staff' : '/admin';
  const setActiveView = (view) => navigate(view === 'pos' ? '/pos' : `${basePath}/${view}`);

  const views = {
    dashboard: isStaff ? <StaffDashboardView user={user} onNavigate={setActiveView} /> : <DashboardView onNavigate={setActiveView} />,
    products: <ProductsView />, inventory: <InventoryView />, orders: <OrdersView />,
    customers: <CustomersView />, returns: <ReturnsView />, staff: <StaffView />,
    reviews: <ReviewsView />, reports: <ReportsView />, promotions: <PromotionsView />,
    banners: <BannersView />, content: <ContentView />, chat: <ChatView />,
  };
  if (!views[activeView]) return <Navigate to={`${basePath}/dashboard`} replace />;
  return <AdminLayout activeView={activeView} onNavigate={setActiveView} onLogout={onLogout} user={user}>{views[activeView]}</AdminLayout>;
};

export default AdminDashboard;
