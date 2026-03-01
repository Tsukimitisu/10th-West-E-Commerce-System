import React, { useEffect, useState, useCallback } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, AlertTriangle, Package, Clock, ArrowUpRight, RotateCcw, MessageSquare } from 'lucide-react';
import { getDashboardStats, getOrders, getProducts } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import StatCard from '../../components/owner/StatCard';
import ChartCard from '../../components/owner/ChartCard';
import { useSocketEvent } from '../../context/SocketContext';

const COLORS = ['#f97316', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

const DashboardView = () => {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [s, o, p] = await Promise.all([getDashboardStats(), getOrders(), getProducts()]);
      setStats(s); setOrders(o); setProducts(p);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time: refresh dashboard on key events
  useSocketEvent('order:new', loadData);
  useSocketEvent('order:updated', loadData);
  useSocketEvent('inventory:updated', loadData);
  useSocketEvent('inventory:low-stock', loadData);

  if (loading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white rounded-xl border border-gray-100" />)}
      <div className="col-span-full h-72 bg-white rounded-xl border border-gray-100" />
    </div>
  );

  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const lowStock = products.filter(p => p.stock_quantity <= p.low_stock_threshold);
  const recentOrders = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);
  const topProducts = [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  const todaySales = orders.filter(o => {
    const d = new Date(o.created_at);
    const t = new Date();
    return d.toDateString() === t.toDateString();
  }).reduce((s, o) => s + o.total_amount, 0);

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Welcome back! Here's what's happening.</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['7d', '30d', '90d']).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${range === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign size={20} />} label="Today's Sales" value={`₱${todaySales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} change={12} changeLabel="vs yesterday" color="bg-green-50 text-green-600" className="bg-white/60 backdrop-blur-xl border-white/40 shadow-xl shadow-green-900/5" />
        <StatCard icon={<TrendingUp size={20} />} label="Total Revenue" value={`₱${(stats?.totalSales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} change={8} changeLabel="this month" color="bg-blue-50 text-blue-600" className="bg-white/60 backdrop-blur-xl border-white/40 shadow-xl shadow-blue-900/5" />
        <StatCard icon={<ShoppingCart size={20} />} label="Total Orders" value={stats?.totalOrders || orders.length} change={5} changeLabel="this month" color="bg-purple-50 text-purple-600" className="bg-white/60 backdrop-blur-xl border-white/40 shadow-xl shadow-purple-900/5" />
        <StatCard icon={<AlertTriangle size={20} />} label="Low Stock Items" value={lowStock.length} color="bg-amber-50 text-amber-600" className="bg-white/60 backdrop-blur-xl border-white/40 shadow-xl shadow-amber-900/5" />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Clock size={14} /> Pending Orders</div>
          <p className="text-lg font-bold text-gray-900">{pendingOrders}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><DollarSign size={14} /> Avg. Order</div>
          <p className="text-lg font-bold text-gray-900">₱{(stats?.avgOrderValue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><RotateCcw size={14} /> Pending Returns</div>
          <p className="text-lg font-bold text-gray-900">{stats?.pendingReturns || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><MessageSquare size={14} /> Open Tickets</div>
          <p className="text-lg font-bold text-gray-900">{stats?.openTickets || 0}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Chart */}
        <ChartCard title="Sales Trend" subtitle="Revenue over time" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.salesTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={d => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} labelFormatter={d => new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} />
                <Line type="monotone" dataKey="amount" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Revenue by Channel Pie */}
        <ChartCard title="Revenue by Channel" subtitle="Online vs POS">
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats?.salesByChannel || []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} style={{ fontSize: 11 }}>
                  {(stats?.salesByChannel || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Bottom row: Recent Orders + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-display font-semibold text-sm text-gray-900">Recent Orders</h3>
            <button className="text-xs text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1">View All <ArrowUpRight size={12} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Order</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500">Total</th>
              </tr></thead>
              <tbody>
                {recentOrders.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">#{o.id}</td>
                    <td className="px-5 py-3 text-gray-600">{o.guest_info?.name || `User ${o.user_id}`}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase
                        ${o.status === 'pending' ? 'bg-yellow-50 text-yellow-700' : o.status === 'paid' || o.status === 'completed' ? 'bg-green-50 text-green-700' : o.status === 'shipped' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">₱{o.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {recentOrders.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-sm">No orders yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products + Low Stock */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-display font-semibold text-sm text-gray-900">Top Products</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {topProducts.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="w-8 h-8 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="m-auto text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400">₱{p.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <span className="text-xs text-gray-500">{p.stock_quantity} in stock</span>
                </div>
              ))}
            </div>
          </div>

          {lowStock.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1"><AlertTriangle size={14} /> Low Stock Alerts</h4>
              <div className="space-y-1.5">
                {lowStock.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-amber-900 truncate flex-1">{p.name}</span>
                    <span className="font-bold text-amber-700 ml-2">{p.stock_quantity} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
