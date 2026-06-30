import React, { useState } from 'react';
import {
  Activity,
  ChevronLeft,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { logoutApi } from '../../services/api';
import { clearCurrentAuthUser } from '../../services/authSession';
import BrandMark from '../ui/BrandMark';

const NAV_ITEMS = [
  { id: 'overview', label: 'System overview', icon: LayoutDashboard, group: 'Dashboard' },
  { id: 'users', label: 'Users & roles', icon: Users, group: 'Access control' },
  { id: 'security', label: 'Security', icon: Shield, group: 'Access control' },
  { id: 'config', label: 'Configuration', icon: Settings, group: 'System' },
  { id: 'logs', label: 'Monitoring & logs', icon: Activity, group: 'System' },
  { id: 'backup', label: 'Backup & recovery', icon: Database, group: 'System' },
];

const SuperAdminLayout = ({ activeView, onNavigate, user, children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { connected } = useSocket();

  const handleNav = (item) => {
    onNavigate(item.id);
    setMobileOpen(false);
  };

  const confirmLogout = async () => {
    try {
      await logoutApi();
    } catch {
      // Local cleanup still signs the user out when the API is unavailable.
    }
    clearCurrentAuthUser();
    setShowLogoutConfirm(false);
    window.location.href = `${window.location.origin}${window.location.pathname}#/login`;
  };

  const SidebarContent = ({ mobile = false }) => (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-[#111a31] to-[#080d19] shadow-2xl">
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <BrandMark dark compact={collapsed && !mobile} link={false} className="[&>span:first-child]:h-9 [&>span:first-child]:w-9" />
        {mobile && <button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close navigation"><X size={19} /></button>}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const active = item.id === activeView;
          const showGroup = index === 0 || NAV_ITEMS[index - 1].group !== item.group;
          return (
            <React.Fragment key={item.id}>
              {showGroup && (!collapsed || mobile) && <p className={`${index ? 'mt-5' : 'mt-2'} px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500`}>{item.group}</p>}
              <button
                onClick={() => handleNav(item)}
                title={collapsed && !mobile ? item.label : undefined}
                className={`mt-1 flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors ${active ? 'bg-white/10 text-orange-400 ring-1 ring-white/10' : 'text-slate-300 hover:bg-white/6 hover:text-white'} ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
              >
                <Icon size={17} className={active ? 'text-orange-400' : 'text-slate-400'} />
                {(!collapsed || mobile) && <span className="flex-1 text-left">{item.label}</span>}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className={`flex items-center gap-3 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-500/15 text-xs font-bold text-orange-400">{user?.name?.charAt(0)?.toUpperCase() || 'S'}</span>
          {(!collapsed || mobile) && <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{user?.name || 'Super Admin'}</p><p className="text-[10px] text-slate-400">Super administrator</p></div>}
          <button onClick={() => setShowLogoutConfirm(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400" title="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  );

  const title = NAV_ITEMS.find((item) => item.id === activeView)?.label || 'System overview';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className={`${collapsed ? 'w-[88px]' : 'w-[272px]'} hidden flex-col bg-[#080d19] p-3 transition-all duration-200 lg:flex`}>
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#080d19] p-3"><SidebarContent mobile /></aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed((value) => !value)} className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} /></button>
            <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
            <div><h1 className="font-display text-sm font-bold text-slate-950">{title}</h1><p className="hidden text-[10px] text-slate-500 sm:block">Global system administration</p></div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />} {connected ? 'Live' : 'Reconnecting'}
          </span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-6">{children}</main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="super-logout-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600"><LogOut size={21} /></span>
            <h2 id="super-logout-title" className="mt-4 font-display text-xl font-bold text-slate-950">Sign out?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">You will need to authenticate again to access system controls.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="min-h-11 flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmLogout} className="min-h-11 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700">Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminLayout;
