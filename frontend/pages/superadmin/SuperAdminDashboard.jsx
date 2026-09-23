import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SuperAdminLayout from '../../components/superadmin/SuperAdminLayout';
import SuperAdminOverview from './SuperAdminOverview';
import UserManagementView from './UserManagementView';
import SystemSecurityView from './SystemSecurityView';
import SystemConfigView from './SystemConfigView';
import MonitoringView from './MonitoringView';
import BackupRecoveryView from './BackupRecoveryView';
import InventoryProductItemsView from '../owner/InventoryProductItemsView';

const SuperAdminDashboard = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const aliases = { dashboard: 'overview', roles: 'users', settings: 'config', 'audit-logs': 'logs' };
  const segment = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const activeView = segment === 'inventory' && location.pathname.endsWith('/inventory/product-items')
    ? 'product-items' : aliases[segment] || segment;
  const routes = { overview: 'dashboard', users: 'users', security: 'security', config: 'settings', logs: 'audit-logs', backup: 'backup', 'product-items': 'inventory/product-items' };
  const setActiveView = (view) => navigate(`/superadmin/${routes[view] || 'dashboard'}`);
  const views = {
    overview: <SuperAdminOverview onNavigate={setActiveView} />, users: <UserManagementView />,
    security: <SystemSecurityView />, config: <SystemConfigView />, logs: <MonitoringView />,
    backup: <BackupRecoveryView />, 'product-items': <InventoryProductItemsView />,
  };
  return <SuperAdminLayout activeView={activeView} onNavigate={setActiveView} user={user}>{views[activeView] || views.overview}</SuperAdminLayout>;
};

export default SuperAdminDashboard;
