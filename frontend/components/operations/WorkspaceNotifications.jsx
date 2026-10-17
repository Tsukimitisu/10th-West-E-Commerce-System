import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, getMyPermissions } from '../../services/api';
import { useSocketEvent } from '../../context/SocketContext';
import { repairMojibake } from '../../utils/text';
import PageHeader from './PageHeader';
import BrandButton from '../ui/BrandButton';
import EmptyState from '../ui/EmptyState';

export default function WorkspaceNotifications({ onNavigate, variant = 'staff' }) {
  const owner = variant === 'owner';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState(new Set());
  useEffect(() => { let active = true; getMyPermissions().then(rows => { if (active) setPermissions(new Set(rows)); }).catch(() => {}); return () => { active = false; }; }, []);
  const load = useCallback(async () => {
    try { const rows = await getNotifications(); setItems(Array.isArray(rows) ? rows : []); setError(''); }
    catch { setError('Notifications could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('notification', load);
  const markRead = async id => {
    setBusy(true);
    try {
      if (id) await markNotificationRead(id); else await markAllNotificationsRead();
      await load();
    } catch { setError('Read status could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <PageHeader title={owner ? "Owner notifications" : "Staff notifications"} description="Order updates, inventory alerts and messages for your workday." actions={items.some(item => !item.is_read) && <BrandButton variant="secondary" disabled={busy} onClick={() => markRead()}>Mark all read</BrandButton>} />
    {error && <div role="alert" className="staff-account-feedback">{error}<BrandButton variant="ghost" onClick={load}>Retry</BrandButton></div>}
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Notifications">
      {loading ? <p role="status" className="p-5 text-sm">Loading notifications…</p> : items.length ? items.map(item => {
        const target = String(item.reference_type || item.type || '').includes('order') ? 'orders' : /inventory|product/.test(`${item.reference_type || ''} ${item.type || ''}`) ? 'inventory' : String(item.type || '').includes('chat') ? 'chat' : null;
        return <article key={item.id} className="staff-notification-row" data-unread={!item.is_read}>
          <Bell size={18} className="mt-1 shrink-0 text-slate-600" aria-hidden="true" />
          <div className="staff-notification-copy"><h2>{repairMojibake(item.title || 'Shop update')}{!item.is_read && <span className="ml-2 text-xs font-medium text-orange-700">Unread</span>}</h2><p>{repairMojibake(item.message || '')}</p><time dateTime={item.created_at}>{item.created_at ? new Date(item.created_at).toLocaleString('en-PH') : ''}</time><div className="mt-2 flex flex-wrap gap-2">{target && (owner || permissions.has(`${target}.view`)) && <BrandButton variant="ghost" onClick={() => onNavigate(target)}>Open {target}</BrandButton>}{!item.is_read && <BrandButton variant="ghost" disabled={busy} onClick={() => markRead(item.id)}><Check size={15} aria-hidden="true" />Mark read</BrandButton>}</div></div>
        </article>;
      }) : <EmptyState icon={Bell} title="You're up to date" description="Operational updates will appear here." />}
    </section>
  </div>;
}
