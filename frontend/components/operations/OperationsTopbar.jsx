import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronDown, Menu, Wifi, WifiOff } from 'lucide-react';
import BrandMark from '../ui/BrandMark';
import { workspaceRole } from './OperationsSidebar';

export default function OperationsTopbar({ title, contextLabel, user, connected, collapsed, onCollapse, onOpenNavigation, onLogout, actions }) {
  const menuRef = useRef(null);
  const isStaff = user?.role === 'store_staff';
  const isOwner = ['owner', 'admin'].includes(user?.role);
  useEffect(() => {
    const close = event => {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      } else if (event.type === 'pointerdown' && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, []);
  return <header className="operations-topbar">
    <div className="ops-topbar-context">
      <button type="button" className="ops-icon-control hidden lg:grid" onClick={onCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><ChevronLeft size={18} className={collapsed ? 'rotate-180' : ''} aria-hidden="true" /></button>
      <button type="button" className="ops-icon-control lg:hidden" onClick={onOpenNavigation} aria-label="Open navigation"><Menu size={20} aria-hidden="true" /></button>
      <BrandMark compact link={false} className="operations-mobile-logo lg:hidden" />
      <div className="min-w-0"><p className="ops-context-caption">{contextLabel}</p><p className="ops-context-title">{title}</p></div>
    </div>
    <div className="ops-topbar-actions">
      <span className="ops-connection" title={connected ? 'Live updates connected' : 'Live updates reconnecting'}>{connected ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}<span>{connected ? 'Live' : 'Reconnecting'}</span></span>
      {actions}
      <details className="ops-user-menu" ref={menuRef}>
        <summary aria-label="Open profile menu"><span className="ops-user-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span><span className="ops-user-name">{user?.name || 'Team member'}</span><ChevronDown size={14} aria-hidden="true" /></summary>
        <div className="ops-user-popover">
          <p>{user?.name || 'Team member'}<span>{workspaceRole(user?.role)}</span></p>
          <Link to={isStaff ? '/staff/account' : isOwner ? '/admin/account' : '/profile'} onClick={() => { menuRef.current.open = false; }}>Profile</Link>
          <Link to={isStaff ? '/staff/account#security' : isOwner ? '/admin/account#security' : '/profile?tab=security'} onClick={() => { menuRef.current.open = false; }}>Account & security</Link>
          <button type="button" onClick={() => { menuRef.current.open = false; onLogout(isStaff || isOwner ? menuRef.current.querySelector('summary') : undefined); }}>Sign out</button>
        </div>
      </details>
    </div>
  </header>;
}
