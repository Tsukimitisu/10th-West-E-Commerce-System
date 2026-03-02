import React, { useState } from 'react';
import AdminLayout from '../../components/owner/AdminLayout';
import DashboardView from './DashboardView';
import ProductsView from './ProductsView';
import InventoryView from './InventoryView';
import OrdersView from './OrdersView';
import ReturnsView from './ReturnsView';
import StaffView from './StaffView';
import ReportsView from './ReportsView';
import BannersView from './BannersView';
import PromotionsView from './PromotionsView';
import ContentView from './ContentView';

const AdminDashboard = ({ onLogout }) => {
  const userStr = localStorage.getItem('shopCoreUser');
  const user = userStr ? JSON.parse(userStr) : null;
  const isStaff = user?.role === 'store_staff';
  const [activeView, setActiveView] = useState(isStaff ? 'orders' : 'dashboard');

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'products': return <ProductsView />;
      case 'inventory': return <InventoryView />;
      case 'orders': return <OrdersView />;
      case 'returns': return <ReturnsView />;
      case 'staff': return <StaffView />;
      case 'reports': return <ReportsView />;
      case 'promotions': return <PromotionsView />;
      case 'banners': return <BannersView />;
      case 'content': return <ContentView />;
      default: return <DashboardView />;
    }
  };

  return (
    <AdminLayout activeView={activeView} onNavigate={setActiveView} onLogout={onLogout}>
      {renderView()}
    </AdminLayout>
  );
};

export default AdminDashboard;
