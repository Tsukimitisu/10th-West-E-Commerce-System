import React, { useEffect, useState } from 'react';
import { getSalesReport, getSalesByChannel, getTopProducts, getDailySalesTrend, getStockLevelsReport, getProfitReport, getOrders } from '../../services/api';
import { BarChart3, Download, Calendar, TrendingUp, Package, DollarSign, ShoppingBag, Boxes, FileText, Printer, Users } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import ChartCard from '../../components/owner/ChartCard';

const ReportsView = () => {
  const [tab, setTab] = useState('sales');
  const [dateRange, setDateRange] = useState('30d');
  const [salesReport, setSalesReport] = useState(null);
  const [channelData, setChannelData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [salesTrend, setSalesTrend] = useState([]);
  const [stockLevels, setStockLevels] = useState([]);
  const [profitReport, setProfitReport] = useState(null);
  const [customerActivity, setCustomerActivity] = useState({ total: 0, newThisMonth: 0, mostActive: [] });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sales, channels, top, trend, stock, profit, orders] = await Promise.all([
        getSalesReport(dateRange).catch(() => null),
        getSalesByChannel().catch(() => []),
        getTopProducts(10).catch(() => []),
        getDailySalesTrend(dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90).catch(() => []),
        getStockLevelsReport().catch(() => []),
        getProfitReport(dateRange).catch(() => null),
        getOrders().catch(() => []),
      ]);
      setSalesReport(sales); setChannelData(Array.isArray(channels) ? channels : []);
      setTopProducts(Array.isArray(top) ? top : []); setSalesTrend(Array.isArray(trend) ? trend : []);
      setStockLevels(Array.isArray(stock) ? stock : []); setProfitReport(profit);

      // Build customer activity from orders
      const allOrders = Array.isArray(orders) ? orders : [];
      const customerMap = {};
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      let newCount = 0;
      allOrders.forEach(order => {
        const custId = order.user_id || order.customer_id || order.customer_email || 'unknown';
        const custName = order.customer_name || order.user_name || order.customer_email || `Customer #${custId}`;
        if (!customerMap[custId]) {
          customerMap[custId] = { id: custId, name: custName, orders: 0, total: 0, firstOrder: order.created_at };
        }
        customerMap[custId].orders += 1;
        customerMap[custId].total += Number(order.total || order.total_amount || 0);
        if (order.created_at && new Date(order.created_at) >= monthStart && !customerMap[custId].countedNew) {
          // Check if first order is this month
          if (new Date(customerMap[custId].firstOrder) >= monthStart) {
            customerMap[custId].countedNew = true;
          }
        }
      });
      const customers = Object.values(customerMap);
      customers.forEach(c => { if (c.countedNew) newCount++; });
      const mostActive = [...customers].sort((a, b) => b.orders - a.orders).slice(0, 5);
      setCustomerActivity({ total: customers.length, newThisMonth: newCount, mostActive });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateRange]);

  const COLORS = ['#f97316', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ec4899', '#0891b2', '#65a30d'];

  const tabs = [
    { id: 'sales', label: 'Sales', icon: TrendingUp },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'financial', label: 'Financial', icon: DollarSign },
    { id: 'customers', label: 'Customers', icon: Users },
  ];

  const handleExport = (type) => {
    const data = type === 'sales' ? salesTrend : type === 'products' ? topProducts : stockLevels;
    if (!data?.length) return;
    const header = Object.keys(data[0]).join(',');
    const rows = data.map((r) => Object.values(r).join(',')).join('\n');
    const blob = new Blob([header + '\n' + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${type}-report.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleExportExcel = () => {
    // Gather all available data into a comprehensive CSV
    let csvContent = '';
    // Sales summary
    if (salesReport) {
      csvContent += 'SALES SUMMARY\n';
      csvContent += 'Total Sales,Orders,Avg Order Value,Items Sold\n';
      csvContent += `${salesReport.total_sales || 0},${salesReport.total_orders || 0},${salesReport.avg_order_value || 0},${salesReport.total_items || 0}\n\n`;
    }
    // Sales trend
    if (salesTrend.length > 0) {
      csvContent += 'SALES TREND\n';
      csvContent += Object.keys(salesTrend[0]).join(',') + '\n';
      salesTrend.forEach(row => { csvContent += Object.values(row).join(',') + '\n'; });
      csvContent += '\n';
    }
    // Top products
    if (topProducts.length > 0) {
      csvContent += 'TOP PRODUCTS\n';
      csvContent += Object.keys(topProducts[0]).join(',') + '\n';
      topProducts.forEach(row => { csvContent += Object.values(row).join(',') + '\n'; });
      csvContent += '\n';
    }
    // Profit
    if (profitReport) {
      csvContent += 'PROFIT & LOSS\n';
      csvContent += 'Gross Revenue,Total Cost,Net Profit,Margin\n';
      csvContent += `${profitReport.gross_revenue || 0},${profitReport.total_cost || 0},${profitReport.net_profit || 0},${profitReport.margin || 0}%\n\n`;
    }
    // Customer Activity
    if (customerActivity.mostActive.length > 0) {
      csvContent += 'CUSTOMER ACTIVITY\n';
      csvContent += 'Customer,Orders,Total Spent\n';
      customerActivity.mostActive.forEach(c => { csvContent += `${c.name},${c.orders},${c.total}\n`; });
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `full-report-${dateRange}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Reports & Analytics</h1>
          <p className="text-sm text-gray-500">Business intelligence and performance reports</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-all">
            <Printer size={13} /> Export PDF
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 rounded-lg text-xs font-medium text-white hover:bg-orange-600 transition-all">
            <FileText size={13} /> Export Excel
          </button>
          <div className="flex bg-white rounded-lg border border-gray-100 p-0.5">
            {['7d', '30d', '90d'].map(r => (
              <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${dateRange === r ? 'bg-orange-50 text-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>{r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-orange-50 text-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Sales Tab */}
          {tab === 'sales' && (
            <div className="space-y-4">
              {/* Sales KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Sales', value: `₱${(salesReport?.total_sales || 0).toLocaleString()}`, color: 'bg-green-50 text-green-600' },
                  { label: 'Orders', value: (salesReport?.total_orders || 0).toString(), color: 'bg-blue-50 text-blue-600' },
                  { label: 'Avg Order', value: `₱${(salesReport?.avg_order_value || 0).toFixed(0)}`, color: 'bg-purple-50 text-purple-600' },
                  { label: 'Items Sold', value: (salesReport?.total_items || 0).toString(), color: 'bg-amber-50 text-amber-600' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
                    <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <ChartCard title="Sales Trend" action={<button onClick={() => handleExport('sales')} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Download size={12} /> CSV</button>}>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={salesTrend}>
                        <defs><linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.1} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <Tooltip formatter={(v) => [`₱${Number(v).toLocaleString()}`, '']} />
                        <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="url(#salesGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
                <ChartCard title="Sales by Channel">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={channelData.length > 0 ? channelData : [{ name: 'Online', value: 65 }, { name: 'POS', value: 35 }]} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {(channelData.length > 0 ? channelData : [{ name: 'Online', value: 65 }, { name: 'POS', value: 35 }]).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip /> <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </div>
          )}

          {/* Products Tab */}
          {tab === 'products' && (
            <div className="space-y-4">
              <ChartCard title="Top Selling Products" action={<button onClick={() => handleExport('products')} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Download size={12} /> CSV</button>}>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={topProducts.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="#9ca3af" width={120} />
                      <Tooltip formatter={(v) => [v, 'Units Sold']} />
                      <Bar dataKey="quantity_sold" fill="#f97316" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50/80 border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">#</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Product</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Price</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Rating</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                            <td className="px-4 py-3 text-right text-gray-900">₱{(p.price || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-amber-600">★ {(p.rating || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
            </div>
          )}

          {/* Inventory Tab */}
          {tab === 'inventory' && (
            <div className="space-y-4">
              <ChartCard title="Stock Level Distribution" action={<button onClick={() => handleExport('inventory')} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Download size={12} /> CSV</button>}>
                {stockLevels.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stockLevels.slice(0, 20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#9ca3af" angle={-45} textAnchor="end" height={80} />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip />
                      <Bar dataKey="stock_quantity" fill="#2563eb" radius={[4, 4, 0, 0]} name="Stock" />
                      <Bar dataKey="low_stock_threshold" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Threshold" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="p-8 text-center text-sm text-gray-500">No stock data available</div>
                )}
              </ChartCard>
            </div>
          )}

          {/* Financial Tab */}
          {tab === 'financial' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Gross Revenue', value: `₱${(profitReport?.gross_revenue || salesReport?.total_sales || 0).toLocaleString()}` },
                  { label: 'Total Cost', value: `₱${(profitReport?.total_cost || 0).toLocaleString()}` },
                  { label: 'Net Profit', value: `₱${(profitReport?.net_profit || 0).toLocaleString()}` },
                  { label: 'Margin', value: `${(profitReport?.margin || 0).toFixed(1)}%` },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
                    <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Profit & Loss Breakdown */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign size={16} className="text-orange-500" />
                  <h3 className="font-semibold text-sm text-gray-900">Profit & Loss Statement</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Gross Revenue (Sales)</span>
                    <span className="text-sm font-semibold text-gray-900">₱{(profitReport?.gross_revenue || salesReport?.total_sales || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Cost of Goods Sold (Buying Price)</span>
                    <span className="text-sm font-semibold text-red-500">- ₱{(profitReport?.total_cost || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-dashed border-gray-200">
                    <span className="text-sm font-medium text-gray-700">Gross Profit</span>
                    <span className="text-sm font-bold text-gray-900">₱{((profitReport?.gross_revenue || salesReport?.total_sales || 0) - (profitReport?.total_cost || 0)).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 bg-orange-50 rounded-lg px-3 -mx-1">
                    <span className="text-sm font-bold text-orange-700">Net Profit</span>
                    <span className="text-lg font-bold text-orange-600">₱{(profitReport?.net_profit || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Profit Margin</span>
                    <span className={`text-sm font-bold ${(profitReport?.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(profitReport?.margin || 0).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <ChartCard title="Revenue vs Cost">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesTrend.map(d => ({ ...d, cost: d.cost || (d.revenue || 0) * 0.6 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip formatter={(v) => [`₱${Number(v).toLocaleString()}`, '']} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#f97316" name="Revenue" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" fill="#9ca3af" name="Cost" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Customers Tab */}
          {tab === 'customers' && (
            <div className="space-y-4">
              {/* Customer KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                      <Users size={16} className="text-orange-500" />
                    </div>
                    <span className="text-xs text-gray-500">Total Customers</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{customerActivity.total}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                      <TrendingUp size={16} className="text-green-500" />
                    </div>
                    <span className="text-xs text-gray-500">New This Month</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{customerActivity.newThisMonth}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                      <ShoppingBag size={16} className="text-blue-500" />
                    </div>
                    <span className="text-xs text-gray-500">Avg Orders per Customer</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{customerActivity.total > 0 ? (customerActivity.mostActive.reduce((sum, c) => sum + c.orders, 0) / Math.min(customerActivity.total, customerActivity.mostActive.length) || 0).toFixed(1) : '0'}</p>
                </div>
              </div>

              {/* Most Active Customers */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Users size={16} className="text-orange-500" />
                  <h3 className="font-semibold text-sm text-gray-900">Most Active Customers</h3>
                </div>
                {customerActivity.mostActive.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No customer data available</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">#</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Customer</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Orders</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Total Spent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {customerActivity.mostActive.map((customer, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-bold text-orange-500">{(customer.name || '?')[0].toUpperCase()}</span>
                                </div>
                                <span className="font-medium text-gray-900">{customer.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded-full">{customer.orders}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900">₱{customer.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportsView;
