import React, { useEffect, useState, useCallback } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, AlertTriangle, Package, Clock, ArrowUpRight, RotateCcw, MessageSquare } from 'lucide-react';
import { getDashboardStats, getOrders, getProducts } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend, ScatterChart, Scatter } from 'recharts';
import StatCard from '../../components/owner/StatCard';
import ChartCard from '../../components/owner/ChartCard';
import { useSocketEvent } from '../../context/SocketContext';

const COLORS = ['#ef4444', '#dc2626', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

const DashboardView = () => {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [selectedTime, setSelectedTime] = useState(null);

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
      {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-gray-800 rounded-xl border border-gray-700" />)}
      <div className="col-span-full h-72 bg-gray-800 rounded-xl border border-gray-700" />
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

  // Calculate sales by day of week and hour of day
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const salesByTime = {};
  
  // Initialize with zeros
  for (let day = 0; day < 7; day++) {
    for (let hour = 10; hour <= 19; hour++) {
      const key = `${day}-${hour}`;
      salesByTime[key] = { day: dayNames[day], dayNum: day, hour, sales: 0 };
    }
  }
  
  // Aggregate sales data
  orders.forEach(o => {
    const date = new Date(o.created_at);
    const dayOfWeek = date.getDay();
    const hour = date.getHours();
    if (hour >= 10 && hour <= 19) {
      const key = `${dayOfWeek}-${hour}`;
      if (salesByTime[key]) {
        salesByTime[key].sales += o.total_amount;
      }
    }
  });
  
  const timeSeriesData = Object.values(salesByTime).sort((a, b) => {
    if (a.dayNum !== b.dayNum) return a.dayNum - b.dayNum;
    return a.hour - b.hour;
  });

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl text-white">Dashboard</h1>
          <p className="text-sm text-gray-400">Welcome back! Here's what's happening.</p>
        </div>
        <div className="flex bg-gray-800 rounded-lg p-0.5">
          {(['7d', '30d', '90d']).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${range === r ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}>
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign size={20} />} label="Today's Sales" value={`â‚±${todaySales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} change={12} changeLabel="vs yesterday" color="bg-green-500/20 text-green-400" className="bg-gray-800 border-gray-700 shadow-xl shadow-green-900/5" />
        <StatCard icon={<TrendingUp size={20} />} label="Total Revenue" value={`â‚±${(stats?.totalSales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} change={8} changeLabel="this month" color="bg-blue-500/20 text-blue-400" className="bg-gray-800 border-gray-700 shadow-xl shadow-blue-900/5" />
        <StatCard icon={<ShoppingCart size={20} />} label="Total Orders" value={stats?.totalOrders || orders.length} change={5} changeLabel="this month" color="bg-purple-500/20 text-purple-400" className="bg-gray-800 border-gray-700 shadow-xl shadow-purple-900/5" />
        <StatCard icon={<AlertTriangle size={20} />} label="Low Stock Items" value={lowStock.length} color="bg-amber-500/20 text-amber-400" className="bg-gray-800 border-gray-700 shadow-xl shadow-amber-900/5" />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1"><Clock size={14} /> Pending Orders</div>
          <p className="text-lg font-bold text-white">{pendingOrders}</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1"><DollarSign size={14} /> Avg. Order</div>
          <p className="text-lg font-bold text-white">â‚±{(stats?.avgOrderValue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1"><RotateCcw size={14} /> Pending Returns</div>
          <p className="text-lg font-bold text-white">{stats?.pendingReturns || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1"><MessageSquare size={14} /> Open Tickets</div>
          <p className="text-lg font-bold text-white">{stats?.openTickets || 0}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Chart */}
        <ChartCard title="Sales Trend" subtitle="Revenue over time" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.salesTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={d => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `â‚±${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `â‚±${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} labelFormatter={d => new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} />
                <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={2} dot={false} />
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
                <Tooltip formatter={(v) => `â‚±${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Sales by Time Heatmap + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Heatmap */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 p-4 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-sm text-white">Orders by Time</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Monday to Sunday, 10am to 7pm total sales</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="text-[10px] text-gray-400">Low</div>
                <div className="w-3 h-3 bg-red-200 rounded"></div>
              </div>
              <div className="flex items-center gap-1">
                <div className="text-[10px] text-gray-400">Med</div>
                <div className="w-3 h-3 bg-red-500 rounded"></div>
              </div>
              <div className="flex items-center gap-1">
                <div className="text-[10px] text-gray-400">High</div>
                <div className="w-3 h-3 bg-red-800 rounded"></div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="px-1.5 py-1 text-gray-400 font-medium text-[10px] text-left w-8">Time</th>
                    {dayNames.map(day => (
                      <th key={day} className="px-0.5 py-1 text-gray-400 font-medium text-[10px] w-8 text-center">{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }, (_, i) => 10 + i).map(hour => {
                    const hourData = timeSeriesData.filter(d => d.hour === hour);
                    const maxSales = Math.max(...timeSeriesData.map(d => d.sales), 1);
                    return (
                      <tr key={hour}>
                        <td className="px-1.5 py-0.5 text-gray-400 font-medium text-[9px] text-left">{String(hour).padStart(2, '0')}</td>
                        {dayNames.map((_, dayNum) => {
                          const data = hourData.find(d => d.dayNum === dayNum);
                          const sales = data?.sales || 0;
                          const intensity = maxSales > 0 ? sales / maxSales : 0;
                          const bgColor = intensity === 0 
                            ? 'bg-gray-700 hover:bg-gray-600' 
                            : intensity < 0.33 
                            ? 'bg-red-200 hover:bg-red-300' 
                            : intensity < 0.67 
                            ? 'bg-red-500 hover:bg-red-600' 
                            : 'bg-red-800 hover:bg-red-900';
                          return (
                            <td key={dayNum} className="px-0.5 py-0.5">
                              <div 
                                onClick={() => setSelectedTime({ day: dayNum, hour, dayName: dayNames[dayNum], sales })}
                                className={`h-6 w-6 rounded flex items-center justify-center text-[7px] font-bold text-white transition-all cursor-pointer group relative box-border ${bgColor} ${selectedTime?.day === dayNum && selectedTime?.hour === hour ? 'shadow-lg shadow-yellow-400/50' : ''}`}
                                title={`${dayNames[dayNum]} ${hour}:00 - â‚±${sales.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}>
                                {sales > 500 && (
                                  <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                                    {(sales / 1000).toFixed(0)}k
                                  </span>
                                )}
                                <div className="hidden group-hover:block absolute bottom-full mb-1.5 bg-gray-950 border border-gray-600 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                                  â‚±{sales.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Details Panel */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 p-4 shadow-xl h-96 flex flex-col overflow-hidden">
          <h3 className="font-display font-semibold text-sm text-white mb-1">
            {selectedTime ? `${selectedTime.dayName} ${String(selectedTime.hour).padStart(2, '0')}:00` : 'Select a time'}
          </h3>
          <p className="text-[10px] text-gray-400 mb-3">Product sales history</p>
          
          {selectedTime ? (
            <>
              <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-[10px] text-gray-300">Total Sales</p>
                <p className="text-lg font-bold text-red-400">â‚±{selectedTime.sales.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</p>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                {orders
                  .filter(o => {
                    const date = new Date(o.created_at);
                    const dayOfWeek = date.getDay();
                    const hour = date.getHours();
                    return dayOfWeek === selectedTime.day && hour === selectedTime.hour;
                  })
                  .map(order => (
                    <div key={order.id} className="border-b border-gray-700 pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-medium text-white">Order #{order.id}</p>
                        <p className="text-[10px] font-bold text-red-400">â‚±{order.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</p>
                      </div>
                      <p className="text-[9px] text-gray-400 mb-0.5">{order.guest_info?.name || `Customer ${order.user_id}`}</p>
                      <div className="text-[9px] text-gray-400 space-y-0">
                        {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                          order.items.map((item, idx) => (
                            <p key={idx}>â€¢ {item.name || item.product_name} x{item.quantity}</p>
                          ))
                        ) : (
                          <p>-</p>
                        )}
                      </div>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase ${
                        order.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        order.status === 'paid' || order.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        order.status === 'shipped' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-gray-9000/20 text-gray-400'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  ))}
                {orders.filter(o => {
                  const date = new Date(o.created_at);
                  const dayOfWeek = date.getDay();
                  const hour = date.getHours();
                  return dayOfWeek === selectedTime.day && hour === selectedTime.hour;
                }).length === 0 && (
                  <p className="text-[10px] text-gray-400 text-center py-3">No orders found</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <p className="text-[10px] text-center">Click on a time cell to view</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Recent Orders + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h3 className="font-display font-semibold text-sm text-white">Recent Orders</h3>
            <button className="text-xs text-red-500 hover:text-red-400 font-medium flex items-center gap-1">View All <ArrowUpRight size={12} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-700">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Order</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400">Status</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-400">Total</th>
              </tr></thead>
              <tbody>
                {recentOrders.map(o => (
                  <tr key={o.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/50">
                    <td className="px-5 py-3 font-medium text-white">#{o.id}</td>
                    <td className="px-5 py-3 text-gray-300">{o.guest_info?.name || `User ${o.user_id}`}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase
                        ${o.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : o.status === 'paid' || o.status === 'completed' ? 'bg-green-500/20 text-green-400' : o.status === 'shipped' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-9000/20 text-gray-400'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-white">â‚±{o.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {recentOrders.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-sm">No orders yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products + Low Stock */}
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="font-display font-semibold text-sm text-white">Top Products</h3>
            </div>
            <div className="divide-y divide-gray-700">
              {topProducts.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-5 h-5 rounded-full bg-gray-700 text-gray-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="w-8 h-8 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                    {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="m-auto text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400">â‚±{p.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <span className="text-xs text-gray-400">{p.stock_quantity} in stock</span>
                </div>
              ))}
            </div>
          </div>

          {lowStock.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1"><AlertTriangle size={14} /> Low Stock Alerts</h4>
              <div className="space-y-1.5">
                {lowStock.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-amber-300 truncate flex-1">{p.name}</span>
                    <span className="font-bold text-amber-400 ml-2">{p.stock_quantity} left</span>
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


