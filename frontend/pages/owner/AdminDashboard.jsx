import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
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

const AdminDashboard = ({ user, onLogout }) => {
  const canAccessAdmin = user?.role === 'owner' || user?.role === 'store_staff' || user?.role === 'admin';

  if (!canAccessAdmin) {
    return <Navigate to="/login" replace />;
  }

  const isStaff = user?.role === 'store_staff';
  const [activeView, setActiveView] = useState(isStaff ? 'orders' : 'dashboard');

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'products': return <ProductsView />;
      case 'inventory': return <InventoryView />;
      case 'orders': return <OrdersView />;
      case 'customers': return <CustomersView />;
      case 'returns': return <ReturnsView />;
      case 'staff': return <StaffView />;
      case 'reviews': return <ReviewsView />;
      case 'reports': return <ReportsView />;
      case 'promotions': return <PromotionsView />;
      case 'banners': return <BannersView />;
      case 'content': return <ContentView />;
      default: return <DashboardView />;
    }
  };

  return (
    <AdminLayout activeView={activeView} onNavigate={setActiveView} onLogout={onLogout} user={user}>
      {renderView()}
    </AdminLayout>
  );
};

export default AdminDashboard;


