import { getMyPermissions, getOrderById, getMyReturns, getReturns, getProductById, getInventory,
  getChatConversationMessages, getSellerChat, markNotificationRead } from './api.js';
import { resolveNotificationDestination } from '../utils/notificationDestination.js';

export const notificationReadChanged = () => window.dispatchEvent(new Event('notifications:read'));

export async function openNotification(notification, user, { navigate, close = () => {}, onRead = () => {} }) {
  close();
  if (!notification.is_read && notification.type !== 'announcement') {
    try { await markNotificationRead(notification.id); onRead(notification.id); notificationReadChanged(); }
    catch { /* Keep the unread indicator when saving failed; navigation still works. */ }
  }
  const role = user?.role;
  const permissions = role === 'store_staff' ? await getMyPermissions().catch(() => []) : [];
  const matches = (rows, id) => Array.isArray(rows) && rows.some(row => String(row.id) === id);
  const path = await resolveNotificationDestination(notification, role, { permissions, exists: async (resource, id) => {
    if (resource === 'order') return String((await getOrderById(id))?.id) === id;
    if (resource === 'return') return matches(await (role === 'customer' ? getMyReturns() : getReturns()), id);
    if (resource === 'product') return role === 'customer' ? String((await getProductById(id))?.id) === id : matches(await getInventory(), id);
    if (resource === 'conversation') {
      const result = await (role === 'customer' ? getChatConversationMessages(id, { limit: 1 }) : getSellerChat(id));
      const conversation = result?.conversation || result?.thread;
      return String(conversation?.id || conversation?.conversation_id) === id;
    }
    return false;
  } });
  navigate(path);
}
