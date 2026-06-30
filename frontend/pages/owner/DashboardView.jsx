import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  MessageCircle,
  PackageCheck,
  RotateCcw,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import {
  getDashboardStats,
  getOrders,
  getProducts,
  getReturns,
  getSellerChatUnreadCount,
} from '../../services/api';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSocketEvent } from '../../context/SocketContext';
import MetricCard from '../../components/operations/MetricCard';
import PageHeader from '../../components/operations/PageHeader';
import SectionCard from '../../components/operations/SectionCard';

const currency = (value, compact = false) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: compact ? 'compact' : 'standard',
  maximumFractionDigits: compact ? 1 : 2,
}).format(Number(value || 0));

const validSaleStatuses = new Set([
  'paid', 'processing', 'packed', 'ready_for_pickup',
  'shipped', 'out_for_delivery', 'delivered', 'partially_refunded',
]);

const statusStyle = {
  pending: 'bg-amber-50 text-amber-700',
  payment_pending: 'bg-amber-50 text-amber-700',
  paid: 'bg-blue-50 text-blue-700',
  processing: 'bg-orange-50 text-orange-700',
  packed: 'bg-cyan-50 text-cyan-700',
  ready_for_pickup: 'bg-teal-50 text-teal-700',
  shipped: 'bg-violet-50 text-violet-700',
  out_for_delivery: 'bg-indigo-50 text-indigo-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-slate-100 text-slate-600',
};

const DashboardView = ({ onNavigate }) => {
  const [data, setData] = useState({
    stats: null,
    orders: [],
    products: [],
    returns: [],
    unreadChats: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [stats, orders, products, returns, unreadChats] = await Promise.all([
      getDashboardStats().catch(() => null),
      getOrders().catch(() => []),
      getProducts().catch(() => []),
      getReturns().catch(() => []),
      getSellerChatUnreadCount().catch(() => 0),
    ]);
    setData({
      stats,
      orders: Array.isArray(orders) ? orders : [],
      products: Array.isArray(products) ? products : [],
      returns: Array.isArray(returns) ? returns : returns?.returns || [],
      unreadChats: Number(unreadChats || 0),
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSocketEvent('order:new', loadData);
  useSocketEvent('order:updated', loadData);
  useSocketEvent('inventory:updated', loadData);
  useSocketEvent('inventory:low-stock', loadData);

  const operational = useMemo(() => {
    const today = new Date().toDateString();
    const calculatedTodaySales = data.orders
      .filter((order) => new Date(order.created_at).toDateString() === today && validSaleStatuses.has(order.status))
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const todaySales = data.stats?.todaySales ?? calculatedTodaySales;
    const pending = data.orders.filter((order) => ['pending', 'payment_pending'].includes(order.status));
    const toProcess = data.orders.filter((order) => ['paid', 'processing', 'packed', 'ready_for_pickup'].includes(order.status));
    const paymentIssues = data.orders.filter((order) => ['payment_pending', 'failed'].includes(order.status));
    const shipmentIssues = data.orders.filter((order) => (
      ['shipped', 'out_for_delivery'].includes(order.status) && !order.tracking_number
    ));
    const lowStock = data.products.filter((product) => (
      Number(product.stock_quantity || 0) <= Number(product.low_stock_threshold || 0)
    ));
    const pendingReturns = data.returns.filter((item) => ['pending', 'requested'].includes(item.status));
    return { todaySales, pending, toProcess, paymentIssues, shipmentIssues, lowStock, pendingReturns };
  }, [data]);

  const recentOrders = useMemo(() => [...data.orders]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 7), [data.orders]);

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-16 max-w-2xl rounded-xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-xl bg-slate-200" />)}
        </div>
        <div className="h-80 rounded-xl bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commerce overview"
        title="Operations dashboard"
        description="Current sales, fulfillment work, inventory risk, and customer-service queues from live store data."
        actions={(
          <button type="button" onClick={() => onNavigate('orders')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            View orders <ArrowRight size={15} />
          </button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} label="Sales today" value={currency(operational.todaySales)} detail="Paid and active orders created today" tone="success" />
        <MetricCard icon={ShoppingCart} label="Total orders" value={data.stats?.totalOrders ?? data.orders.length} detail={`${operational.pending.length} awaiting action`} tone="info" onClick={() => onNavigate('orders')} />
        <MetricCard icon={PackageCheck} label="Orders to process" value={operational.toProcess.length} detail="Paid, packing, or ready for dispatch" tone="brand" onClick={() => onNavigate('orders')} />
        <MetricCard icon={AlertTriangle} label="Low-stock items" value={operational.lowStock.length} detail="At or below reorder threshold" tone={operational.lowStock.length ? 'warning' : 'success'} onClick={() => onNavigate('inventory')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Return requests', value: operational.pendingReturns.length, icon: RotateCcw, tone: 'text-violet-700 bg-violet-50', view: 'returns' },
          { label: 'Unread conversations', value: data.unreadChats, icon: MessageCircle, tone: 'text-blue-700 bg-blue-50', view: 'chat' },
          { label: 'Payment issues', value: operational.paymentIssues.length, icon: CircleDollarSign, tone: 'text-red-700 bg-red-50', view: 'orders' },
          { label: 'Shipment issues', value: operational.shipmentIssues.length, icon: Truck, tone: 'text-amber-700 bg-amber-50', view: 'orders' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} type="button" onClick={() => onNavigate(item.view)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm hover:border-slate-300">
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${item.tone}`}><Icon size={17} /></span>
              <span><span className="block text-lg font-bold text-slate-950">{item.value}</span><span className="block text-xs text-slate-500">{item.label}</span></span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <SectionCard title="Sales trend" description="Completed and active sales reported by the dashboard API.">
          {data.stats?.salesTrend?.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.stats.salesTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ea580c" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#ea580c" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(date) => new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(value) => currency(value, true)} />
                  <Tooltip formatter={(value) => currency(value)} labelFormatter={(date) => new Date(date).toLocaleDateString('en-PH', { dateStyle: 'medium' })} />
                  <Area type="monotone" dataKey="amount" stroke="#ea580c" strokeWidth={2.25} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-[280px] place-items-center text-center">
              <div><CircleDollarSign size={28} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No completed sales yet</p><p className="mt-1 text-xs text-slate-500">Sales history will appear when transactions are recorded.</p></div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Inventory attention" description="Products nearest to operational risk." padded={false}>
          {operational.lowStock.length ? (
            <div className="divide-y divide-slate-100">
              {operational.lowStock.slice(0, 6).map((product) => (
                <button key={product.id} type="button" onClick={() => onNavigate('inventory')} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{product.name}</span><span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">{product.sku || product.part_number || 'No SKU'}</span></span>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{Number(product.stock_quantity || 0)} left</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center"><PackageCheck size={28} className="mx-auto text-emerald-500" /><p className="mt-3 text-sm font-medium text-slate-700">Stock levels are healthy</p></div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent orders" description="Latest transactions across online and point-of-sale channels." action={<button type="button" onClick={() => onNavigate('orders')} className="text-xs font-semibold text-orange-700 hover:text-orange-800">View all</button>} padded={false}>
        {recentOrders.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  {['Order', 'Customer', 'Channel', 'Status', 'Date', 'Total'].map((heading) => <th key={heading} className={`px-5 py-3 text-xs font-semibold text-slate-600 ${heading === 'Total' ? 'text-right' : ''}`}>{heading}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">#{String(order.id).padStart(4, '0')}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{order.customer_name || order.shipping_name || `User ${order.user_id}`}</td>
                    <td className="px-5 py-3 text-xs capitalize text-slate-500">{order.source || 'online'}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyle[order.status] || 'bg-slate-100 text-slate-600'}`}>{String(order.status || 'unknown').replace(/_/g, ' ')}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('en-PH')}</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-slate-900">{currency(order.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-sm text-slate-500">No orders have been recorded.</div>
        )}
      </SectionCard>
    </div>
  );
};

export default DashboardView;
