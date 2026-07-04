import React, { useEffect, useState } from 'react';
import { getSalesReport, getSalesByChannel, getTopProducts, getDailySalesTrend, getStockLevelsReport, getProfitReport, getPosSalesReport, getReturnRefundReport, getCustomerAnalytics } from '../../services/api';
import { BarChart3, Download, Calendar, TrendingUp, Package, DollarSign, ShoppingBag, Boxes, FileText, Printer, Users } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import ChartCard from '../../components/owner/ChartCard';
import PageHeader from '../../components/operations/PageHeader';

const ReportsView = () => {
  const [tab, setTab] = useState('sales');
  const [dateRange, setDateRange] = useState('30d');
  const [salesReport, setSalesReport] = useState(null);
  const [channelData, setChannelData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [salesTrend, setSalesTrend] = useState([]);
  const [stockLevels, setStockLevels] = useState([]);
  const [profitReport, setProfitReport] = useState(null);
  const [posReport, setPosReport] = useState(null);
  const [returnReport, setReturnReport] = useState(null);
  const [customerActivity, setCustomerActivity] = useState({ total: 0, newThisMonth: 0, mostActive: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [sales, channels, top, trend, stock, profit, pos, returnsAndRefunds, customers] = await Promise.all([
        getSalesReport(dateRange).catch(() => null),
        getSalesByChannel(dateRange).catch(() => []),
        getTopProducts(10, dateRange).catch(() => []),
        getDailySalesTrend(dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90).catch(() => []),
        getStockLevelsReport().catch(() => []),
        getProfitReport(dateRange).catch(() => null),
        getPosSalesReport(dateRange).catch(() => null),
        getReturnRefundReport(dateRange).catch(() => null),
        getCustomerAnalytics().catch(() => ({ total: 0, new_this_month: 0, average_order_count: 0, most_active: [] })),
      ]);
      setSalesReport(sales); setChannelData(Array.isArray(channels) ? channels.map((row) => ({
        name: row.channel || 'unknown',
        value: Number(row.total_revenue || 0),
        order_count: Number(row.order_count || 0),
      })) : []);
      setTopProducts(Array.isArray(top) ? top : []); setSalesTrend(Array.isArray(trend) ? trend : []);
      setStockLevels(Array.isArray(stock?.by_category) ? stock.by_category : []); setProfitReport(profit);
      setPosReport(pos); setReturnReport(returnsAndRefunds);

      setCustomerActivity({
        total: Number(customers?.total || 0),
        newThisMonth: Number(customers?.new_this_month || 0),
        averageOrderCount: Number(customers?.average_order_count || 0),
        mostActive: Array.isArray(customers?.most_active) ? customers.most_active : [],
      });
    } catch (e) { console.error(e); setError('Reports could not be loaded. Please try again.'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateRange]);

  const COLORS = ['#f97316', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ec4899', '#0891b2', '#65a30d'];

  const tabs = [
    { id: 'sales', label: 'Sales', icon: TrendingUp },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'financial', label: 'Financial', icon: DollarSign },
    { id: 'pos', label: 'POS', icon: ShoppingBag },
    { id: 'returns', label: 'Returns', icon: Calendar },
    { id: 'customers', label: 'Customers', icon: Users },
  ];

  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const toCsv = (rows) => {
    if (!rows?.length) return '';
    const keys = Object.keys(rows[0]);
    return [keys.map(csvCell).join(','), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))].join('\n');
  };

  const handleExport = (type) => {
    const data = type === 'sales' ? salesTrend : type === 'products' ? topProducts : stockLevels;
    if (!data?.length) return;
    const blob = new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' });
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
      csvContent += 'Total Sales,Orders,Avg Order Value,POS Orders\n';
      csvContent += `${salesReport.total_revenue || 0},${salesReport.total_orders || 0},${salesReport.average_order_value || 0},${salesReport.pos_orders || 0}\n\n`;
    }
    // Sales trend
    if (salesTrend.length > 0) {
      csvContent += 'SALES TREND\n';
      csvContent += `${toCsv(salesTrend)}\n`;
      csvContent += '\n';
    }
    // Top products
    if (topProducts.length > 0) {
      csvContent += 'TOP PRODUCTS\n';
      csvContent += `${toCsv(topProducts)}\n`;
      csvContent += '\n';
    }
    // Profit
    if (profitReport) {
      csvContent += 'PROFIT & LOSS\n';
      csvContent += 'Gross Revenue,Total Cost,Net Profit,Margin\n';
      csvContent += `${profitReport.total_revenue || 0},${profitReport.profit_exact ? profitReport.total_cost : ''},${profitReport.profit_exact ? profitReport.net_profit : ''},${profitReport.profit_exact ? `${profitReport.profit_margin}%` : 'Historical COGS missing'}\n\n`;
    }
    // Customer Activity
    if (customerActivity.mostActive.length > 0) {
      csvContent += 'CUSTOMER ACTIVITY\n';
      csvContent += 'Customer,Orders,Total Spent\n';
      customerActivity.mostActive.forEach(c => { csvContent += `${csvCell(c.name)},${csvCell(c.orders)},${csvCell(c.total)}\n`; });
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `full-report-${dateRange}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Insights"
        title="Reports & analytics"
        description="Real sales, product, inventory, customer, and profitability reporting."
        actions={<>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs font-medium text-gray-600 hover:bg-red-500/10 hover:text-orange-600 hover:border-red-200 transition-all">
            <Printer size={13} /> Export PDF
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/100 rounded-lg text-xs font-medium text-white hover:bg-red-600 transition-all">
            <FileText size={13} /> Export CSV
          </button>
          <div className="flex bg-gray-800 rounded-lg border border-gray-700 p-0.5">
            {['7d', '30d', '90d'].map(r => (
              <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${dateRange === r ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-700'}`}>{r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}</button>
            ))}
          </div>
        </>}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg border border-gray-700 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-red-500/10 text-red-500' : 'text-gray-400 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center"><div className="w-6 h-6 border-2 border-gray-700 border-t-orange-500 rounded-full animate-spin mx-auto" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{error}</div>
      ) : (
        <>
          {/* Sales Tab */}
          {tab === 'sales' && (
            <div className="space-y-4">
              {/* Sales KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Sales', value: `₱${(salesReport?.total_revenue || 0).toLocaleString()}`, color: 'bg-green-50 text-green-600' },
                  { label: 'Orders', value: (salesReport?.total_orders || 0).toString(), color: 'bg-blue-50 text-blue-600' },
                  { label: 'Avg Order', value: `₱${(salesReport?.average_order_value || 0).toFixed(0)}`, color: 'bg-purple-50 text-purple-600' },
                  { label: 'POS Orders', value: (salesReport?.pos_orders || 0).toString(), color: 'bg-amber-50 text-amber-600' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                    <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
                    <p className="text-lg font-bold text-white">{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <ChartCard title="Sales Trend" action={<button onClick={() => handleExport('sales')} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"><Download size={12} /> CSV</button>}>
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
                  {channelData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip /> <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-[280px] place-items-center text-sm text-slate-500">No completed sales in this period.</div>
                  )}
                </ChartCard>
              </div>
            </div>
          )}

          {/* Products Tab */}
          {tab === 'products' && (
            <div className="space-y-4">
              <ChartCard title="Top Selling Products" action={<button onClick={() => handleExport('products')} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"><Download size={12} /> CSV</button>}>
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
                  <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50/80 border-b border-gray-700">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">#</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Product</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Price</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Rating</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                            <td className="px-4 py-3 text-right text-white">₱{(p.price || 0).toLocaleString()}</td>
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
              <ChartCard title="Stock Level Distribution" action={<button onClick={() => handleExport('inventory')} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"><Download size={12} /> CSV</button>}>
                {stockLevels.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stockLevels.slice(0, 20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="category" tick={{ fontSize: 9 }} stroke="#9ca3af" angle={-45} textAnchor="end" height={80} />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip />
                      <Bar dataKey="total_stock" fill="#2563eb" radius={[4, 4, 0, 0]} name="Stock" />
                      <Bar dataKey="low_stock_items" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Low-stock items" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="p-8 text-center text-sm text-gray-400">No stock data available</div>
                )}
              </ChartCard>
            </div>
          )}

          {/* Financial Tab */}
          {tab === 'financial' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Gross Revenue', value: `₱${(profitReport?.total_revenue || salesReport?.total_revenue || 0).toLocaleString()}` },
                  { label: profitReport?.profit_exact ? 'Total Cost' : 'Total Cost (incomplete)', value: profitReport?.profit_exact ? `₱${Number(profitReport.total_cost).toLocaleString()}` : 'Not computable' },
                  { label: profitReport?.profit_exact ? 'Net Profit' : 'Net Profit (incomplete)', value: profitReport?.profit_exact ? `₱${Number(profitReport.net_profit).toLocaleString()}` : 'Not computable' },
                  { label: 'Margin', value: profitReport?.profit_exact ? `${Number(profitReport.profit_margin).toFixed(1)}%` : 'Not computable' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                    <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
                    <p className="text-lg font-bold text-white">{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Profit & Loss Breakdown */}
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign size={16} className="text-red-500" />
                  <h3 className="font-semibold text-sm text-white">Profit & Loss Statement</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-700">
                    <span className="text-sm text-gray-600">Gross Revenue (Sales)</span>
                    <span className="text-sm font-semibold text-white">₱{(profitReport?.total_revenue || salesReport?.total_revenue || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-700">
                    <span className="text-sm text-gray-600">Cost of Goods Sold (Buying Price)</span>
                    <span className="text-sm font-semibold text-red-500">{profitReport?.profit_exact ? `- ₱${Number(profitReport.total_cost).toLocaleString()}` : 'Historical COGS missing'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-dashed border-gray-700">
                    <span className="text-sm font-medium text-gray-700">Gross Profit</span>
                    <span className="text-sm font-bold text-white">{profitReport?.profit_exact ? `₱${Number(profitReport.gross_profit).toLocaleString()}` : 'Not computable'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 bg-red-500/10 rounded-lg px-3 -mx-1">
                    <span className="text-sm font-bold text-orange-700">Net Profit</span>
                    <span className="text-lg font-bold text-orange-600">{profitReport?.profit_exact ? `₱${Number(profitReport.net_profit).toLocaleString()}` : 'Not computable'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600">Profit Margin</span>
                    <span className={`text-sm font-bold ${Number(profitReport?.profit_margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profitReport?.profit_exact ? `${Number(profitReport.profit_margin).toFixed(1)}%` : 'Not computable'}</span>
                  </div>
                </div>
              </div>

              <ChartCard title="Daily revenue">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip formatter={(v) => [`₱${Number(v).toLocaleString()}`, '']} />
                    <Bar dataKey="revenue" fill="#f97316" name="Revenue" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {tab === 'pos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ['Completed sales', posReport?.total_sales || 0],
                  ['POS revenue', `₱${Number(posReport?.total_revenue || 0).toLocaleString()}`],
                  ['Voided sales', posReport?.voided_sales || 0],
                ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-700 bg-gray-800 p-4"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 text-xl font-bold text-white">{value}</p></div>)}
              </div>
              <ChartCard title="POS transactions">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-gray-700 text-left text-xs text-gray-400"><th className="p-3">Receipt</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3">Date</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{(posReport?.sales || []).map((sale) => <tr key={sale.id} className="border-b border-gray-700/60"><td className="p-3 text-white">{sale.receipt_number}</td><td className="p-3 text-gray-300">{sale.voided_at ? 'voided' : sale.status}</td><td className="p-3 text-gray-300">{sale.payment_status}</td><td className="p-3 text-gray-300">{new Date(sale.created_at).toLocaleDateString()}</td><td className="p-3 text-right font-semibold text-white">₱{Number(sale.total_amount).toLocaleString()}</td></tr>)}</tbody></table>
                  {!posReport?.sales?.length && <p className="p-8 text-center text-sm text-gray-400">No valid POS transactions in this period.</p>}
                </div>
              </ChartCard>
            </div>
          )}

          {tab === 'returns' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['Returns', returnReport?.total_returns || 0],
                  ['Pending', returnReport?.pending_returns || 0],
                  ['Refunds processed', returnReport?.processed_refunds || 0],
                  ['Refunded amount', `₱${Number(returnReport?.refunded_amount || 0).toLocaleString()}`],
                ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-700 bg-gray-800 p-4"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 text-xl font-bold text-white">{value}</p></div>)}
              </div>
              <ChartCard title="Return and refund activity">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-gray-700 text-left text-xs text-gray-400"><th className="p-3">Return</th><th className="p-3">Order</th><th className="p-3">Return status</th><th className="p-3">Refund status</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{(returnReport?.returns || []).map((item) => <tr key={item.id} className="border-b border-gray-700/60"><td className="p-3 text-white">#{item.id}</td><td className="p-3 text-gray-300">#{item.order_id}</td><td className="p-3 text-gray-300">{item.status}</td><td className="p-3 text-gray-300">{item.refund_status || 'Not processed'}</td><td className="p-3 text-right font-semibold text-white">₱{Number(item.processed_refund || item.refund_amount || 0).toLocaleString()}</td></tr>)}</tbody></table>
                  {!returnReport?.returns?.length && <p className="p-8 text-center text-sm text-gray-400">No return or refund activity in this period.</p>}
                </div>
              </ChartCard>
            </div>
          )}

          {/* Customers Tab */}
          {tab === 'customers' && (
            <div className="space-y-4">
              {/* Customer KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                      <Users size={16} className="text-red-500" />
                    </div>
                    <span className="text-xs text-gray-400">Total Customers</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{customerActivity.total}</p>
                </div>
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                      <TrendingUp size={16} className="text-green-500" />
                    </div>
                    <span className="text-xs text-gray-400">New This Month</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{customerActivity.newThisMonth}</p>
                </div>
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                      <ShoppingBag size={16} className="text-blue-500" />
                    </div>
                    <span className="text-xs text-gray-400">Avg Orders per Customer</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{Number(customerActivity.averageOrderCount || 0).toFixed(1)}</p>
                </div>
              </div>

              {/* Most Active Customers */}
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-700 flex items-center gap-2">
                  <Users size={16} className="text-red-500" />
                  <h3 className="font-semibold text-sm text-white">Most Active Customers</h3>
                </div>
                {customerActivity.mostActive.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">No customer data available</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-700">
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">#</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Customer</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Orders</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Total Spent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {customerActivity.mostActive.map((customer, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-bold text-red-500">{(customer.name || '?')[0].toUpperCase()}</span>
                                </div>
                                <span className="font-medium text-white">{customer.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="px-2 py-0.5 bg-red-500/10 text-orange-600 text-xs font-semibold rounded-full">{customer.orders}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-white">₱{customer.total.toLocaleString()}</td>
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


