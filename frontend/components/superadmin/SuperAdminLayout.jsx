import React from 'react';
import {
  Activity,
  ClipboardList,
  Database,
  Wrench,
  LayoutDashboard,
  PackageSearch,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { logoutApi } from '../../services/api';
import { clearCurrentAuthUser } from '../../services/authSession';
import OperationsShell from '../operations/OperationsShell';

const NAV_ITEMS = [
  { id: 'overview', label: 'System overview', icon: LayoutDashboard, group: 'System' },
  { id: 'monitoring', label: 'Monitoring', icon: Activity, group: 'System' },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, group: 'System' },
  { id: 'users', label: 'Users & roles', icon: Users, group: 'Access' },
  { id: 'security', label: 'Security controls', icon: Shield, group: 'Access' },
  { id: 'logs', label: 'Audit trail', icon: ClipboardList, group: 'Governance' },
  { id: 'backup', label: 'Backup & recovery', icon: Database, group: 'Governance' },
  { id: 'config', label: 'Configuration', icon: Settings, group: 'Platform' },
  { id: 'product-items', label: 'Product Items', icon: PackageSearch, group: 'Platform' },
];

const SuperAdminLayout = ({ activeView, onNavigate, user, children }) => {
  const { connected } = useSocket();
  const title = NAV_ITEMS.find((item) => item.id === activeView)?.label || 'System overview';

  const handleLogout = async () => {
    await logoutApi().catch(() => {});
    clearCurrentAuthUser();
    window.location.href = `${window.location.origin}${window.location.pathname}#/login`;
  };

  return (
    <OperationsShell
      activeId={activeView}
      navItems={NAV_ITEMS}
      onNavigate={(item) => onNavigate(item.id)}
      onLogout={handleLogout}
      user={user}
      connected={connected}
      title={title}
      contextLabel="Platform administration workspace"
    >
      {children}
    </OperationsShell>
  );
};

export default SuperAdminLayout;
