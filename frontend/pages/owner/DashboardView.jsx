import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CircleDollarSign,
  MessageCircle,
  PackageCheck,
  RotateCcw,
  Truck,
} from 'lucide-react';
import {
  getDashboardStats,
  getInventory,
  getOrders,
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
  packed: 'bg-slate-100 text-slate-700',
  ready_for_pickup: 'bg-slate-100 text-slate-700',
  shipped: 'bg-slate-100 text-slate-700',
  out_for_delivery: 'bg-indigo-50 text-indigo-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-50 text-red-700',
  refunded: 'bg-slate-100 text-slate-600',
};

const DashboardView = ({ onNavigate, user }) => {
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
      getInventory().catch(() => []),
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
      <div className="space-y-5" role="status" aria-label="Loading operations dashboard">
        <PageHeader title="Operations dashboard" description="Loading sales, fulfillment, and inventory activity…" />
        <div className="animate-pulse">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-xl bg-slate-200" />)}
        </div>
        <div className="mt-5 h-80 rounded-xl bg-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="owner-dashboard space-y-6">
      <PageHeader
        eyebrow="Commerce overview"
        title="Business overview"
        description={`${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}. ${new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())} · Sales, orders and inventory at a glance.`}
        actions={(
          <button type="button" onClick={() => onNavigate('orders')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            View orders <ArrowRight size={15} />
          </button>
        )}
      />

      <div className="dashboard-overview">
        <section className="dashboard-trading" aria-label="Business overview">
          <div className="dashboard-sales"><p>Today's sales</p><strong>{currency(operational.todaySales)}</strong><span>Paid and active orders created today</span></div>
          <div className="dashboard-totals">
            <MetricCard label="Reported orders" value={data.stats?.totalOrders ?? data.orders.length} detail="Sales reporting scope" onClick={() => onNavigate('orders')} />
            <MetricCard label="Pending fulfillment" value={operational.toProcess.length} detail="Packing or dispatch" onClick={() => onNavigate('orders')} />
            <MetricCard label="Low stock" value={operational.lowStock.length} detail="Reorder attention" onClick={() => onNavigate('inventory')} />
          </div>
        </section>
        <section className="dashboard-action-queue" aria-label="Needs attention">
          <h2>Needs attention</h2>
          {[
            { label: 'Return requests', value: operational.pendingReturns.length, icon: RotateCcw, view: 'returns' },
            { label: 'Unread conversations', value: data.unreadChats, icon: MessageCircle, view: 'chat' },
            { label: 'Payment issues', value: operational.paymentIssues.length, icon: CircleDollarSign, view: 'orders' },
            { label: 'Shipment issues', value: operational.shipmentIssues.length, icon: Truck, view: 'orders' },
          ].map(({label,value,icon:Icon,view}) => <button key={label} type="button" onClick={() => onNavigate(view)}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong><ArrowRight size={15} aria-hidden="true" /></button>)}
        </section>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <SectionCard title="Sales trend" description="Completed and active sales reported by the dashboard API.">
          {data.stats?.salesTrend?.length ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.stats.salesTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f36a21" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#f36a21" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(date) => new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(value) => currency(value, true)} />
                  <Tooltip formatter={(value) => currency(value)} labelFormatter={(date) => new Date(date).toLocaleDateString('en-PH', { dateStyle: 'medium' })} />
                  <Area type="monotone" dataKey="amount" stroke="#f36a21" strokeWidth={2.25} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-[280px] place-items-center text-center">
              <div><CircleDollarSign size={28} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No completed sales yet</p><p className="mt-1 text-xs text-slate-500">Sales history will appear when transactions are recorded.</p></div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Inventory attention" description="Inventory items nearest to operational risk." padded={false}>
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

      <div className="dashboard-orders-grid">
      <SectionCard title="Recent orders" description="Latest transactions across online and point-of-sale channels." action={<button type="button" onClick={() => onNavigate('orders')} className="text-xs font-semibold text-orange-700 hover:text-orange-800">View all</button>} padded={false}>
        {recentOrders.length ? (
          <><div className="md:hidden">{recentOrders.map(order => <button key={order.id} type="button" onClick={() => onNavigate('orders')} className="staff-order-row"><div className="min-w-0"><p className="font-semibold text-slate-900">#{String(order.id).padStart(4, '0')} · {order.customer_name || order.shipping_name || 'Customer'}</p><small>{String(order.status || 'unknown').replaceAll('_', ' ')} · {new Date(order.created_at).toLocaleDateString('en-PH')}</small></div><span className="text-sm font-semibold tabular-nums">{currency(order.total_amount)}</span></button>)}</div><div tabIndex={0} role="region" aria-label="Recent orders" className="hidden overflow-x-auto md:block">
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
          </div></>
        ) : (
          <div className="px-5 py-12 text-center text-sm text-slate-500">No orders have been recorded.</div>
        )}
      </SectionCard>
      {data.stats?.topProducts?.length > 0 && <SectionCard title="Best sellers" description="By completed sales" padded={false}><ol className="divide-y divide-slate-100">{data.stats.topProducts.slice(0, 5).map((product, index) => <li key={product.id || product.product_id || index} className="flex items-start justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{product.name || product.product_name}</p><p className="mt-1 text-xs text-slate-600">{product.quantity_sold} sold</p></div><span className="shrink-0 text-sm font-semibold text-slate-900">{currency(product.revenue)}</span></li>)}</ol></SectionCard>}
      </div>
    </div>
  );
};

export default DashboardView;
