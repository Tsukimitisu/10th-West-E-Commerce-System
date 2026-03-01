import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Shield, Settings, Activity,
  Database, LogOut, Menu, X, ChevronLeft, AlertTriangle,
  KeyRound, FileText, Wifi, WifiOff
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
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <KeyRound size={18} className="text-white" />
          </div>
          {(!collapsed || mobile) && (
            <div>
              <h1 className="font-display font-bold text-sm text-white leading-none">SUPER ADMIN</h1>
              <p className="text-[10px] text-gray-400 font-medium tracking-wide">SYSTEM CONTROL</p>
            </div>
          )}
        </div>
        {mobile && <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <React.Fragment key={item.id}>
              {item.divider && idx > 0 && <div className="my-2 border-t border-gray-800" />}
              <button
                onClick={() => handleNav(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all
                  ${isActive ? 'bg-red-600/20 text-red-400 shadow-sm' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}
                  ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
                title={collapsed && !mobile ? item.label : undefined}
              >
                <Icon size={18} className={`flex-shrink-0 ${isActive ? 'text-red-400' : 'text-gray-500'}`} />
                {(!collapsed || mobile) && <span className="flex-1 text-left">{item.label}</span>}
              </button>
            </React.Fragment>
          );
        })}

        {/* Divider */}
        <div className="my-3 border-t border-gray-800" />
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-800 flex-shrink-0">
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-red-600/30 text-red-400 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || 'S'}
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Super Admin'}</p>
              <p className="text-[10px] text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          )}
          <button onClick={() => setShowLogoutConfirm(true)} className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen flex bg-gray-950 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`${collapsed ? 'w-[72px]' : 'w-60'} bg-gray-900 border-r border-gray-800 flex-col transition-all duration-200 hidden lg:flex`}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-gray-900 shadow-2xl z-50 flex flex-col">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950">
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors">
              <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-gray-400 hover:text-white">
              <Menu size={20} />
            </button>
            <h2 className="font-display font-semibold text-white text-sm capitalize">
              {NAV_ITEMS.find(n => n.id === activeView)?.label || 'Overview'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${connected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-96 border border-gray-700">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-red-600/20 p-3 rounded-2xl">
                <LogOut className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Sign Out?</h3>
                <p className="text-gray-400 text-sm mt-1">You will be logged out of the system</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl transition-colors">Cancel</button>
              <button onClick={confirmLogout} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors">Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminLayout;
