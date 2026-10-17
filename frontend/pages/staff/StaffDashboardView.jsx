import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  MessageCircle,
  Monitor,
  PackageCheck,
  RotateCcw,
  ShoppingCart,
  ScanBarcode,
} from 'lucide-react';
import {
  getMyPermissions,
  getInventory,
  getOrders,
  getReturns,
  getSellerChatUnreadCount,
} from '../../services/api';
import { useSocketEvent } from '../../context/SocketContext';
import MetricCard from '../../components/operations/MetricCard';
import PageHeader from '../../components/operations/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import SectionCard from '../../components/operations/SectionCard';

const activeOrderStatuses = ['pending', 'paid', 'processing', 'packed', 'ready_for_pickup'];

const StaffDashboardView = ({ user, onNavigate }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState(new Set());
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [unreadChats, setUnreadChats] = useState(0);

  const loadData = useCallback(async () => {
    const permissionList = await getMyPermissions().catch(() => []);
    const allowed = new Set(permissionList);
    setPermissions(allowed);
    const [orderList, productList, returnList, unread] = await Promise.all([
      allowed.has('orders.view') ? getOrders().catch(() => []) : [],
      allowed.has('inventory.view') ? getInventory().catch(() => []) : [],
      allowed.has('returns.view') ? getReturns().catch(() => []) : [],
      allowed.has('chat.view') ? getSellerChatUnreadCount().catch(() => 0) : 0,
    ]);
    setOrders(Array.isArray(orderList) ? orderList : []);
    setProducts(Array.isArray(productList) ? productList : []);
    setReturns(Array.isArray(returnList) ? returnList : returnList?.returns || []);
    setUnreadChats(Number(unread || 0));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSocketEvent('order:new', loadData);
  useSocketEvent('order:updated', loadData);
  useSocketEvent('inventory:updated', loadData);
  useSocketEvent('inventory:low-stock', loadData);

  const assignedOrders = useMemo(() => orders.filter((order) => (
    !order.assigned_staff_id || Number(order.assigned_staff_id) === Number(user?.id)
  )), [orders, user?.id]);
  const activeOrders = assignedOrders.filter((order) => activeOrderStatuses.includes(order.status));
  const toPack = assignedOrders.filter((order) => ['paid', 'processing'].includes(order.status));
  const lowStock = products.filter((product) => Number(product.stock_quantity || 0) <= Number(product.low_stock_threshold || 0));
  const pendingReturns = returns.filter((item) => ['pending', 'requested'].includes(item.status));

  const can = (permission) => permissions.has(permission);
  const tasks = [
    can('orders.view') && {
      label: 'Process orders',
      description: `${activeOrders.length} active order${activeOrders.length === 1 ? '' : 's'} in the queue`,
      icon: ShoppingCart,
      onClick: () => onNavigate('orders'),
    },
    can('inventory.view') && {
      label: 'Review inventory',
      description: `${lowStock.length} item${lowStock.length === 1 ? '' : 's'} at or below the stock threshold`,
      icon: Boxes,
      onClick: () => onNavigate('inventory'),
    },
    can('returns.view') && {
      label: 'Handle returns',
      description: `${pendingReturns.length} request${pendingReturns.length === 1 ? '' : 's'} awaiting review`,
      icon: RotateCcw,
      onClick: () => onNavigate('returns'),
    },
    can('chat.view') && {
      label: 'Customer conversations',
      description: unreadChats ? `${unreadChats} unread conversation${unreadChats === 1 ? '' : 's'}` : 'No unread conversations',
      icon: MessageCircle,
      onClick: () => onNavigate('chat'),
    },
  ].filter(Boolean);

  if (loading) {
    return (
      <div className="space-y-5" role="status" aria-label="Loading staff workspace">
        <PageHeader title={`Good day${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`} description="Loading your operational queue…" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-xl bg-slate-200" />)}
        </div>
      </div>
    );
  }

  const readyOrders = assignedOrders.filter(order => ['packed', 'ready_for_pickup'].includes(order.status));
  const recentOrders = [...activeOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  return (
    <div className="staff-dashboard space-y-5">
      <PageHeader title={`Today's work${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`} description="Process orders, locate parts and keep the shop moving." />
      <div className="staff-quick-actions" aria-label="Staff shortcuts">
        {can('orders.view') && <button type="button" onClick={() => onNavigate('orders')}><PackageCheck size={17} aria-hidden="true" />Process orders</button>}
        {can('inventory.view') && <button type="button" onClick={() => navigate('/staff/inventory', { state: { inventoryTab: 'receive' } })}><ScanBarcode size={17} aria-hidden="true" />Inventory scan</button>}
        {can('pos.access') && <button type="button" onClick={() => navigate('/pos')}><Monitor size={17} aria-hidden="true" />Open POS</button>}
        {can('chat.view') && <button type="button" onClick={() => onNavigate('chat')}><MessageCircle size={17} aria-hidden="true" />Chat{unreadChats ? ` (${unreadChats})` : ''}</button>}
      </div>
      <div className="ops-summary-strip">
        {can('orders.view') && <MetricCard label="Orders to process" value={toPack.length} detail="Paid or processing" onClick={() => onNavigate('orders')} />}
        {can('orders.view') && <MetricCard label="Ready for dispatch" value={readyOrders.length} detail="Packed or ready for pickup" onClick={() => onNavigate('orders')} />}
        {can('inventory.view') && <MetricCard label="Stock alerts" value={lowStock.length} detail="At or below minimum" onClick={() => onNavigate('inventory')} />}
        {can('returns.view') && <MetricCard label="Return requests" value={pendingReturns.length} detail="Awaiting review" onClick={() => onNavigate('returns')} />}
      </div>
      <div className="staff-work-grid">
        <div className="space-y-5">
          <SectionCard title="Order worklist" description="Active assigned and unassigned orders. Open orders to process fulfillment." padded={false}>
            {can('orders.view') && recentOrders.length ? recentOrders.map(order => <button type="button" key={order.id} onClick={() => onNavigate('orders')} className="staff-order-row">
              <div className="min-w-0"><p className="font-semibold text-slate-900">#{String(order.id).padStart(4, '0')} <span className="ml-2 font-normal">{order.customer_name || order.shipping_name || 'Customer'}</span></p><small>{order.shipping_method === 'pickup' ? 'Store pickup' : 'Delivery'} · {new Date(order.created_at).toLocaleDateString('en-PH')}</small></div>
              <StatusBadge tone={['paid', 'processing', 'packed', 'ready_for_pickup'].includes(order.status) ? 'warning' : 'neutral'}>{String(order.status).replaceAll('_', ' ')}</StatusBadge>
            </button>) : <p className="p-5 text-sm text-slate-600">{can('orders.view') ? 'No orders in your worklist.' : 'Order access is not assigned to this account.'}</p>}
          </SectionCard>
          <SectionCard title="Priority queue" description="Current operational tasks, limited to your permitted tools." padded={false}>
            <div className="divide-y divide-slate-100">{tasks.map(task => { const Icon = task.icon; return <button key={task.label} type="button" onClick={task.onClick} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"><Icon size={18} className="shrink-0 text-slate-600" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{task.label}</span><span className="mt-1 block text-xs text-slate-600">{task.description}</span></span><ChevronRight size={16} aria-hidden="true" /></button>; })}</div>
          </SectionCard>
        </div>
        {can('inventory.view') && <SectionCard title="Find & replenish" description="Low-stock parts with their picking locations." padded={false}>
          {lowStock.length ? lowStock.slice(0, 8).map(product => <button type="button" key={product.id} onClick={() => onNavigate('inventory')} className="staff-order-row"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{product.name || product.product_name}</p><small className="font-mono">{product.part_number || product.sku || 'No part number'}</small><small>Box: <strong>{product.box_location || 'Not assigned'}</strong></small></div><StatusBadge tone={Number(product.stock_quantity) <= 0 ? 'danger' : 'warning'}>{Number(product.stock_quantity || 0)} left</StatusBadge></button>) : <p className="p-5 text-sm text-slate-600">No stock alerts right now.</p>}
        </SectionCard>}
      </div>
    </div>
  );
};

export default StaffDashboardView;
