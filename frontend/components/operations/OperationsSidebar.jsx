import React, { useMemo } from 'react';
import { LogOut } from 'lucide-react';
import BrandMark from '../ui/BrandMark';

export const workspaceRole = (role) => role === 'super_admin' ? 'System admin' : ['owner', 'admin'].includes(role) ? 'Owner portal' : 'Staff portal';

export default function OperationsSidebar({ navItems, activeId, user, collapsed, onNavigate, onLogout }) {
  const groups = useMemo(() => navItems.reduce((result, item) => {
    const label = item.group || 'Workspace';
    const group = result.find(entry => entry.label === label);
    if (group) group.items.push(item);
    else result.push({ label, items: [item] });
    return result;
  }, []), [navItems]);
  const isStaff = user?.role === 'store_staff';
  const isOwner = ['owner', 'admin'].includes(user?.role);
  const isSystem = user?.role === 'super_admin';
  return <div className={`operations-sidebar ${isStaff ? 'staff-sidebar' : isOwner ? 'owner-sidebar' : isSystem ? 'system-sidebar' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="operations-brand-header"><BrandMark dark compact={collapsed} link={false} />{!collapsed && <span className="operations-role">{workspaceRole(user?.role)}</span>}</div>
    <nav className="ops-navigation" aria-label="Operations navigation">
      {groups.map(group => <div className="ops-nav-group" key={group.label}>
        {!collapsed && <p className="ops-nav-label">{group.label}</p>}
        {group.items.map(item => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => onNavigate(item)} aria-label={collapsed ? item.label : undefined} aria-current={item.id === activeId ? 'page' : undefined} title={collapsed ? item.label : undefined} className={`ops-nav-item ${item.parentId ? 'ops-nav-child' : ''}`}>
            <Icon size={18} aria-hidden="true" />
            {!collapsed && <><span>{item.label}</span>{Boolean(item.badge) && <span className="ops-nav-count">{item.badge}</span>}</>}
          </button>;
        })}
      </div>)}
    </nav>
    <div className="ops-sidebar-footer">{!collapsed && !isStaff && !isOwner && !isSystem && <span>10th West operations</span>}<button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={17} aria-hidden="true" />{(isStaff || isOwner || isSystem) && !collapsed && <span>Sign out</span>}</button></div>
  </div>;
}
