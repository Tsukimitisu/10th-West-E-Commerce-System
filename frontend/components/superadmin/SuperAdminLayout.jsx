import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Shield, Settings, Activity,
  Database, LogOut, Menu, X, ChevronLeft,
  KeyRound, Wifi, WifiOff
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'User Management', icon: Users, divider: true },
  { id: 'security', label: 'System Security', icon: Shield },
  { id: 'config', label: 'System Config', icon: Settings, divider: true },
  { id: 'logs', label: 'Monitoring & Logs', icon: Activity },
  { id: 'backup', label: 'Backup & Recovery', icon: Database },
];

const SuperAdminLayout = ({ activeView, onNavigate, children }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { connected } = useSocket();
  const userStr = localStorage.getItem('shopCoreUser');
  const user = userStr ? JSON.parse(userStr) : null;

  const handleNav = (item) => {
    onNavigate(item.id);
    setMobileOpen(false);
  };

  const confirmLogout = () => {
    localStorage.removeItem('shopCoreUser');
    localStorage.removeItem('shopCoreToken');
    setShowLogoutConfirm(false);
    window.location.href = window.location.origin + window.location.pathname + '#/login';
    window.location.reload();
  };

  const SidebarContent = ({ mobile = false }) => (
    <>
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <KeyRound size={18} className="text-white" />
          </div>
          {(!collapsed || mobile) && (
            <div>
              <h1 className="font-display font-bold text-sm text-gray-900 leading-none">System Admin</h1>
              <p className="text-[10px] text-gray-400 font-medium tracking-wide">CONTROL PANEL</p>
            </div>
          )}
        </div>
        {mobile && <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <React.Fragment key={item.id}>
              {item.divider && idx > 0 && <div className="my-2 border-t border-gray-100" />}
              <button
                onClick={() => handleNav(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all
                  ${isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}
                  ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
                title={collapsed && !mobile ? item.label : undefined}
              >
                <Icon size={18} className={`flex-shrink-0 ${isActive ? 'text-orange-500' : 'text-gray-400'}`} />
                {(!collapsed || mobile) && <span className="flex-1 text-left">{item.label}</span>}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || 'S'}
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{user?.name || 'Super Admin'}</p>
              <p className="text-[10px] text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          )}
          <button onClick={() => setShowLogoutConfirm(true)} className="text-gray-400 hover:text-orange-500 transition-colors flex-shrink-0" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <aside className={`${collapsed ? 'w-[72px]' : 'w-60'} bg-white border-r border-gray-200 flex-col transition-all duration-200 hidden lg:flex`}>
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/20" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-xl z-50 flex flex-col">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-gray-400 hover:text-gray-600">
              <Menu size={20} />
            </button>
            <h2 className="font-display font-semibold text-gray-800 text-sm">
              {NAV_ITEMS.find(n => n.id === activeView)?.label || 'Overview'}
            </h2>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${connected ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-500 border-red-200'}`}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span className="hidden sm:inline">{connected ? 'Connected' : 'Offline'}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-96 border border-gray-100">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-orange-50 p-3 rounded-xl">
                <LogOut className="w-7 h-7 text-orange-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Sign Out?</h3>
                <p className="text-gray-500 text-sm mt-0.5">You will be logged out of the system</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors">Cancel</button>
              <button onClick={confirmLogout} className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors">Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminLayout;
