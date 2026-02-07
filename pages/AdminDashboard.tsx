import React, { useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import DashboardView from './admin/DashboardView';
import ProductsView from './admin/ProductsView';
import InventoryView from './admin/InventoryView';
import OrdersView from './admin/OrdersView';
import ReceiptsView from './admin/ReceiptsView';
import ReturnsView from './admin/ReturnsView';
import CustomersView from './admin/CustomersView';
import StaffView from './admin/StaffView';
import ReportsView from './admin/ReportsView';
import SettingsView from './admin/SettingsView';
import SecurityView from './admin/SecurityView';

const AdminDashboard: React.FC = () => {
  const [activeView, setActiveView] = useState('dashboard');

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'products': return <ProductsView />;
      case 'inventory': return <InventoryView />;
      case 'orders': return <OrdersView />;
      case 'receipts': return <ReceiptsView />;
      case 'returns': return <ReturnsView />;
      case 'customers': return <CustomersView />;
      case 'staff': return <StaffView />;
      case 'reports': return <ReportsView />;
      case 'settings': return <SettingsView />;
      case 'security': return <SecurityView />;
      default: return <DashboardView />;
    }
  };

  return (
    <AdminLayout activeView={activeView} onNavigate={setActiveView}>
      {renderView()}
    </AdminLayout>
  );
};

export default AdminDashboard;
