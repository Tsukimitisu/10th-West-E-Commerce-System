import React, { useState } from 'react';
import Modal from '../owner/Modal';
import { ConfirmationDialog } from '../ui/BrandPrimitives';
import OperationsSidebar from './OperationsSidebar';
import OperationsTopbar from './OperationsTopbar';
import { OperationsDialogContext } from '../../context/OperationsDialogContext';

export default function OperationsShell({ activeId, navItems, onNavigate, onLogout, user, connected, title, contextLabel, headerActions, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const role = user?.role === 'super_admin' ? 'system' : ['owner', 'admin'].includes(user?.role) ? 'owner' : 'staff';
  const sidebarProps = { navItems, activeId, user, onLogout: () => setConfirmingLogout(true), onNavigate: item => { onNavigate(item); setMobileOpen(false); } };
  return <OperationsDialogContext.Provider value={true}><div className="operations-shell flex h-[100dvh] overflow-hidden bg-slate-50" data-workspace={role}>
    <a href="#operations-main" className="ops-skip-link" onClick={event => { event.preventDefault(); document.getElementById('operations-main')?.focus(); }}>Skip to workspace</a>
    <aside className={`ops-desktop-sidebar ${collapsed ? 'w-[76px]' : 'w-[248px]'} hidden shrink-0 lg:block`}><OperationsSidebar {...sidebarProps} collapsed={collapsed} /></aside>
    <Modal isOpen={mobileOpen} onClose={() => setMobileOpen(false)} title="Workspace navigation" presentation="drawer" tone="navy"><OperationsSidebar {...sidebarProps} /></Modal>
    <div className="flex min-w-0 flex-1 flex-col">
      <OperationsTopbar title={title} contextLabel={contextLabel} user={user} connected={connected} collapsed={collapsed} onCollapse={() => setCollapsed(value => !value)} onOpenNavigation={() => setMobileOpen(true)} onLogout={() => setConfirmingLogout(true)} actions={headerActions} />
      <main id="operations-main" tabIndex={-1} className={`operations-content min-h-0 min-w-0 flex-1 ${activeId === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className={`ops-workspace-body mx-auto w-full max-w-[1600px] ${activeId === 'chat' ? 'h-full min-h-0 p-2 sm:p-3 lg:p-4' : 'p-4 sm:p-5 lg:p-6'}`}>{children}</div>
      </main>
    </div>
    <ConfirmationDialog isOpen={confirmingLogout} onClose={() => setConfirmingLogout(false)} onConfirm={onLogout} title="Sign out?" description="You will need to sign in again to return to this workspace." confirmLabel="Sign out" />
  </div></OperationsDialogContext.Provider>;
}
