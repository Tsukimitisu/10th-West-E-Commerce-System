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
} from 'lucide-react';
import {
  getMyPermissions,
  getOrders,
  getProducts,
  getReturns,
  getSellerChatUnreadCount,
} from '../../services/api';
import { useSocketEvent } from '../../context/SocketContext';
import MetricCard from '../../components/operations/MetricCard';
import PageHeader from '../../components/operations/PageHeader';
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
    const [permissionList, orderList, productList, returnList, unread] = await Promise.all([
      getMyPermissions().catch(() => []),
      getOrders().catch(() => []),
      getProducts().catch(() => []),
      getReturns().catch(() => []),
      getSellerChatUnreadCount().catch(() => 0),
    ]);
    setPermissions(new Set(permissionList));
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
      <div className="space-y-5 animate-pulse">
        <div className="h-16 max-w-xl rounded-xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-xl bg-slate-200" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Staff workspace"
        title={`Good day${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="Your current operational queue, inventory alerts, and approved shortcuts."
        actions={can('pos.access') && (
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Monitor size={16} /> Open POS
          </button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ShoppingCart} label="Active orders" value={activeOrders.length} detail="Assigned or available to process" tone="info" onClick={can('orders.view') ? () => onNavigate('orders') : undefined} />
        <MetricCard icon={PackageCheck} label="Ready to pack" value={toPack.length} detail="Paid and processing orders" tone="brand" onClick={can('orders.view') ? () => onNavigate('orders') : undefined} />
        <MetricCard icon={AlertTriangle} label="Low-stock items" value={lowStock.length} detail="At or below reorder threshold" tone={lowStock.length ? 'warning' : 'success'} onClick={can('inventory.view') ? () => onNavigate('inventory') : undefined} />
        {can('chat.view') && <MetricCard icon={MessageCircle} label="Unread chats" value={unreadChats} detail="Customer conversations" tone={unreadChats ? 'brand' : 'neutral'} onClick={() => onNavigate('chat')} />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <SectionCard title="Priority queue" description="Real-time work that needs staff attention." padded={false}>
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const Icon = task.icon;
              return (
                <button key={task.label} type="button" onClick={task.onClick} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Icon size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{task.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{task.description}</span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Role access" description="Only tools enabled for your account are shown.">
          <dl className="space-y-3">
            {[
              ['Orders', can('orders.view')],
              ['Inventory', can('inventory.view')],
              ['Returns', can('returns.view')],
              ['Point of sale', can('pos.access')],
              ['Chat', can('chat.view')],
            ].map(([label, enabled]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {enabled ? 'Enabled' : 'Not assigned'}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </div>
  );
};

export default StaffDashboardView;
