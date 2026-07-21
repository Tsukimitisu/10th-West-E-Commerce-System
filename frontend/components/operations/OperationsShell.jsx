import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  LogOut,
  Menu,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import BrandMark from '../ui/BrandMark';

const roleName = (role) => ({
  owner: 'Store owner',
  admin: 'Administrator',
  store_staff: 'Store staff',
  cashier: 'Cashier',
  super_admin: 'Super administrator',
}[role] || String(role || 'Team member').replace(/_/g, ' '));

const OperationsShell = ({
  activeId,
  navItems,
  onNavigate,
  onLogout,
  user,
  connected,
  title,
  contextLabel,
  headerActions,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  const groups = useMemo(() => navItems.reduce((result, item) => {
    const group = item.group || 'Workspace';
    const current = result.find((entry) => entry.label === group);
    if (current) current.items.push(item);
    else result.push({ label: group, items: [item] });
    return result;
  }, []), [navItems]);

  const navigateTo = (item) => {
    onNavigate(item);
    setMobileOpen(false);
  };

  const Sidebar = ({ mobile = false }) => (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <BrandMark
          dark
          compact={collapsed && !mobile}
          link={false}
          className="[&>span:first-child]:h-9 [&>span:first-child]:w-9"
        />
        {mobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Operations navigation">
        {groups.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex ? 'mt-6' : ''}>
            {(!collapsed || mobile) && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item)}
                    title={collapsed && !mobile ? item.label : undefined}
                    className={`relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                    } ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-orange-500" />}
                    <Icon size={17} className={active ? 'text-orange-400' : 'text-slate-400'} aria-hidden="true" />
                    {(!collapsed || mobile) && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                        {item.badge ? (
                          <span className="min-w-5 rounded-full bg-orange-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className={`relative flex items-center gap-3 rounded-xl p-2 ${collapsed && !mobile ? 'justify-center' : ''}`}>
          <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open profile menu">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-orange-300">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </span>
          {(!collapsed || mobile) && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user?.name || 'Team member'}</p>
              <p className="truncate text-[11px] text-slate-400">{roleName(user?.role)}</p>
            </div>
          )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingLogout(true)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
          {profileOpen && (!collapsed || mobile) && (
            <div className="absolute bottom-14 left-0 right-0 z-20 rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl">
              <button type="button" onClick={() => { setProfileOpen(false); navigate('/profile'); }} className="block w-full rounded-md px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10">Profile</button>
              <button type="button" onClick={() => { setProfileOpen(false); navigate('/profile?tab=security'); }} className="block w-full rounded-md px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10">Account & security</button>
              <button type="button" onClick={() => { setProfileOpen(false); setConfirmingLogout(true); }} className="block w-full rounded-md px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="operations-shell flex h-screen overflow-hidden bg-slate-50">
      <aside className={`${collapsed ? 'w-[76px]' : 'w-[260px]'} hidden shrink-0 border-r border-slate-800 bg-slate-950 transition-[width] duration-200 lg:block`}>
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation overlay"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,288px)] shadow-2xl">
            <Sidebar mobile />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:flex"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
              <p className="hidden truncate text-[11px] text-slate-500 sm:block">{contextLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
              connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? 'Live' : 'Reconnecting'}
            </span>
            {headerActions}
          </div>
        </header>

        <main className="operations-content min-h-0 flex-1 overflow-y-auto bg-slate-50">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-5 lg:p-6">{children}</div>
        </main>
      </div>

      {confirmingLogout && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="operations-logout-title">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600"><LogOut size={21} /></span>
            <h2 id="operations-logout-title" className="mt-4 font-display text-xl font-bold text-slate-950">Sign out?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">You will need to authenticate again to return to this workspace.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirmingLogout(false)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={onLogout} className="min-h-11 flex-1 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700">Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsShell;
