import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Boxes, ShoppingCart, Monitor,
  RotateCcw, UserCog, BarChart3,
  LogOut, Bell, Search, Menu, X,
  ChevronLeft, ExternalLink, Wifi, WifiOff, Image, Tag, Newspaper
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

const createNavItems = (badges = {}) => [
  // Core
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes, badge: badges.lowStock },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, badge: badges.pendingOrders },
  // Staff-only
  { id: 'pos', label: 'POS Terminal', icon: Monitor, external: '#/pos' },
  { id: 'returns', label: 'Returns', icon: RotateCcw, badge: badges.pendingReturns },
  // Owner: Staff & Reports
  { id: 'staff', label: 'Staff', icon: UserCog, divider: true },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  // Owner: Marketing & Content
  { id: 'promotions', label: 'Promotions', icon: Tag, divider: true },
  { id: 'banners', label: 'Banners', icon: Image },
  { id: 'content', label: 'Content', icon: Newspaper },
];

// Nav items store_staff can see
const STORE_STAFF_NAV = ['inventory', 'orders', 'pos', 'returns'];

// Nav items owner can see (business management only)
const OWNER_NAV = [
  'dashboard', 'products', 'inventory', 'orders',
  'staff', 'reports',
  'promotions', 'banners', 'content'
];

// Super admin sees the same business nav as owner in admin panel
// (system-level features are in the separate /super-admin dashboard)

const AdminLayout = ({ activeView, onNavigate, badges = {}, children }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { connected } = useSocket();
  const userStr = localStorage.getItem('shopCoreUser');
  const user = userStr ? JSON.parse(userStr) : null;
  const allNavItems = createNavItems(badges);
  const navItems = user?.role === 'store_staff'
    ? allNavItems.filter(item => STORE_STAFF_NAV.includes(item.id))
    : allNavItems.filter(item => OWNER_NAV.includes(item.id)); // owner, admin, super_admin all see business nav

  const handleNav = (item) => {
    if (item.external) { window.open(item.external, '_blank'); }
    else { onNavigate(item.id); }
    setMobileOpen(false);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    localStorage.removeItem('shopCoreUser');
    localStorage.removeItem('shopCoreToken');
    setShowLogoutConfirm(false);
    navigate('/');
  };

  const SidebarContent = ({ mobile = false }) => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-extrabold text-sm">10</span>
          </div>
          {(!collapsed || mobile) && (
            <div>
              <h1 className="font-display font-bold text-sm text-gray-900 leading-none">10TH WEST</h1>
              <p className="text-[10px] text-gray-400 font-medium tracking-wide">ADMIN PANEL</p>
            </div>
          )}
        </div>
        {mobile && <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <React.Fragment key={item.id}>
              {item.divider && idx > 0 && <div className="my-2 border-t border-gray-100" />}
              <button
                onClick={() => handleNav(item)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                  ${isActive ? 'bg-orange-50 text-orange-500 shadow-sm shadow-orange-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
                title={collapsed && !mobile ? item.label : undefined}
              >
                <Icon size={18} className={`flex-shrink-0 ${isActive ? 'text-orange-500' : 'text-gray-400'}`} />
                {(!collapsed || mobile) && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge ? <span className="min-w-[20px] h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">{item.badge}</span> : null}
                    {item.external && <ExternalLink size={12} className="text-gray-300" />}
                  </>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{user?.name || 'Admin'}</p>
              <p className="text-[10px] text-gray-400 capitalize">{user?.role}</p>
            </div>
          )}
          <button onClick={handleLogout} className="text-gray-300 hover:text-orange-500 transition-colors flex-shrink-0" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`${collapsed ? 'w-[72px]' : 'w-60'} bg-white border-r border-gray-200 flex-col transition-all duration-200 hidden lg:flex`}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-2xl z-50 flex flex-col">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-gray-400 hover:text-gray-600">
              <Menu size={20} />
            </button>
            <h2 className="font-display font-semibold text-gray-900 text-sm capitalize">{activeView === 'pos' ? 'POS Terminal' : activeView}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${connected ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-500'}`} title={connected ? 'Real-time connected' : 'Reconnecting...'}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
            </div>
            <div className="relative hidden sm:block">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 w-44" />
            </div>
            <button className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full" />
            </button>
            <a href="#/" className="text-xs text-gray-400 hover:text-orange-500 font-medium hidden sm:block">View Store â†’</a>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-96 border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-orange-50 p-3 rounded-2xl">
                <LogOut className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-gray-900">Sign Out?</h3>
                <p className="text-gray-500 font-medium text-sm mt-1">Confirm to logout</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to sign out of your admin account?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-2xl font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 py-3 bg-orange-500 text-white rounded-2xl hover:bg-orange-600 font-bold shadow-lg hover:shadow-xl transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
