import React, { useState } from 'react';
import SuperAdminLayout from '../../components/superadmin/SuperAdminLayout';
import SuperAdminOverview from './SuperAdminOverview';
import UserManagementView from './UserManagementView';
import SystemSecurityView from './SystemSecurityView';
import SystemConfigView from './SystemConfigView';
import MonitoringView from './MonitoringView';
import BackupRecoveryView from './BackupRecoveryView';

const SuperAdminDashboard = () => {
  const [activeView, setActiveView] = useState('overview');

  const renderView = () => {
    switch (activeView) {
      case 'overview': return <SuperAdminOverview onNavigate={setActiveView} />;
      case 'users': return <UserManagementView />;
      case 'security': return <SystemSecurityView />;
      case 'config': return <SystemConfigView />;
      case 'logs': return <MonitoringView />;
      case 'backup': return <BackupRecoveryView />;
      default: return <SuperAdminOverview onNavigate={setActiveView} />;
    }
  };

  return (
    <SuperAdminLayout activeView={activeView} onNavigate={setActiveView}>
      {renderView()}
    </SuperAdminLayout>
  );
};

export default SuperAdminDashboard;
