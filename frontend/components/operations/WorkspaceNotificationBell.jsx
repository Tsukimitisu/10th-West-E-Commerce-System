import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead } from '../../services/api';
import { openNotification, notificationReadChanged } from '../../services/notificationNavigation.js';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import { repairMojibake } from '../../utils/text.js';

const parseNotification = (notification) => {
  let metadata = notification?.metadata || null;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = null; }
  }
  return {
    ...notification,
    metadata,
    thumbnail_url: notification?.thumbnail_url || metadata?.thumbnail_url || metadata?.product_image || null,
  };
};

const notificationTitle = (notification) => {
  if (notification.title) return repairMojibake(notification.title);
  if (notification.reference_type === 'order' || notification.type?.includes('order')) {
    const number = notification.metadata?.order_number || notification.reference_id;
    return number ? `Order #${String(number).padStart(4, '0')} update` : 'Order update';
  }
  if (notification.type?.includes('return')) return 'Return request update';
  return 'Operations update';
};

const notificationIcon = (notification) => {
  const type = `${notification?.type || ''} ${notification?.metadata?.status || ''}`.toLowerCase();
  if (/failed|error|cancelled|rejected/.test(type)) return <XCircle size={16} aria-label="Error notification" />;
  if (/warning|stock|low/.test(type)) return <AlertTriangle size={16} aria-label="Warning notification" />;
  if (/success|paid|delivered|approved/.test(type)) return <CheckCircle2 size={16} aria-label="Success notification" />;
  if (/info|announcement/.test(type)) return <Info size={16} aria-label="Information notification" />;
  return <Bell size={16} aria-label="Notification" />;
};

export default function WorkspaceNotificationBell({ user }) {
  const navigate = useNavigate();
  const { connected, on, off } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef(null);

  const refreshNotifications = useCallback(async () => {
    const [count, list] = await Promise.all([
      getUnreadNotificationCount().catch(() => 0),
      getNotifications().catch(() => []),
    ]);
    setUnreadCount(Number(count || 0));
    setNotifications((Array.isArray(list) ? list : []).map(parseNotification));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refreshNotifications();
    const interval = window.setInterval(refreshNotifications, 30000);
    return () => window.clearInterval(interval);
  }, [refreshNotifications, user]);

  useEffect(() => {
    window.addEventListener('notifications:read', refreshNotifications);
    return () => window.removeEventListener('notifications:read', refreshNotifications);
  }, [refreshNotifications]);

  useEffect(() => {
    if (!user || !connected) return undefined;
    const refresh = () => refreshNotifications();
    on('notification', refresh);
    on('order:new', refresh);
    on('order:updated', refresh);
    on('inventory:low-stock', refresh);
    return () => {
      off('notification', refresh);
      off('order:new', refresh);
      off('order:updated', refresh);
      off('inventory:low-stock', refresh);
    };
  }, [connected, off, on, refreshNotifications, user]);

  useEffect(() => {
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'mousedown' && notificationRef.current && !notificationRef.current.contains(event.target))) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, []);

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications(items => items.map(item => ({ ...item, is_read: true })));
      notificationReadChanged();
    } catch { /* Preserve unread state if the request fails. */ }
  };

  const handleOpen = notification => openNotification(notification, user, {
    navigate, close: () => setNotificationsOpen(false), onRead: id => {
      setUnreadCount(count => Math.max(0, count - 1));
      setNotifications(items => items.map(item => item.id === id ? { ...item, is_read: true } : item));
    },
  });
  return (
    <div className="relative" ref={notificationRef}>
      <button
        type="button"
        onClick={() => setNotificationsOpen((open) => !open)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        aria-expanded={notificationsOpen}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-orange-600 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div className="fixed inset-x-4 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[min(92vw,400px)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Notifications</p>
              <p className="text-[11px] text-slate-500">{unreadCount ? `${unreadCount} unread` : 'You are up to date'}</p>
            </div>
            {unreadCount > 0 && <button type="button" onClick={markAllRead} className="text-xs font-semibold text-orange-700 hover:text-orange-800">Mark all read</button>}
          </div>
          <div className="max-h-[min(420px,calc(100dvh-10rem))] overflow-x-hidden overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Bell size={24} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">No notifications</p>
                <p className="mt-1 text-xs text-slate-500">Operational updates will appear here.</p>
              </div>
            ) : notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleOpen(notification)}
                className={`flex w-full min-w-0 max-w-full gap-3 border-b border-slate-100 px-4 py-3.5 text-left hover:bg-slate-50 ${notification.is_read ? '' : 'bg-orange-50/50'}`}
              >
                {notification.thumbnail_url ? (
                  <img src={resolveProductImageUrl(notification.thumbnail_url)} alt="" onError={handleProductImageError} className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    {notificationIcon(notification)}
                  </span>
                )}
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  <span className="block text-sm font-medium text-slate-900">{notificationTitle(notification)}</span>
                  {notification.message && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">{repairMojibake(notification.message)}</span>}
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {notification.created_at ? new Date(notification.created_at).toLocaleString() : ''}
                  </span>
                </span>
                {!notification.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

}
