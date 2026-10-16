import React, { useEffect, useState } from 'react';
import { getSalesReport, getSalesByChannel, getTopProducts, getDailySalesTrend, getStockLevelsReport, getProfitReport, getPosSalesReport, getReturnRefundReport, getCustomerAnalytics } from '../../services/api';
import { BarChart3, Download, Calendar, TrendingUp, Package, DollarSign, ShoppingBag, Boxes, FileText, Printer, Users } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import ChartCard from '../../components/owner/ChartCard';
import PageHeader from '../../components/operations/PageHeader';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import { buildOwnerReportSections, downloadCsv, openDataReportPdf } from '../../utils/reportExports.js';

const formatReportDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
};

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
  const [warning, setWarning] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const results = await Promise.allSettled([
        getSalesReport(dateRange),
        getSalesByChannel(dateRange),
        getTopProducts(10, dateRange),
        getDailySalesTrend(dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90),
        getStockLevelsReport(),
        getProfitReport(dateRange),
        getPosSalesReport(dateRange),
        getReturnRefundReport(dateRange),
        getCustomerAnalytics(),
      ]);
      if (results.every((result) => result.status === 'rejected')) {
        setError('Reports could not be loaded. Please try again.');
        return;
      }
      if (results.some((result) => result.status === 'rejected')) {
        setWarning('Some report sections could not be loaded. Values shown as zero may be incomplete. Retry to refresh the full report.');
      }
      const [sales, channels, top, trend, stock, profit, pos, returnsAndRefunds, customers] = results.map((result, index) => (
        result.status === 'fulfilled' ? result.value : [null, [], [], [], [], null, null, null, {}][index]
      ));
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
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [dateRange]);

  const COLORS = ['#111c3d', '#f36a21', '#697180', '#d62232', '#b4bdcc'];

  const tabs = [
    { id: 'sales', label: 'Sales', icon: TrendingUp },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'financial', label: 'Financial', icon: DollarSign },
    { id: 'pos', label: 'POS', icon: ShoppingBag },
    { id: 'returns', label: 'Returns', icon: Calendar },
    { id: 'customers', label: 'Customers', icon: Users },
  ];

  const handleExport = (type) => {
    const data = type === 'sales' ? salesTrend : type === 'products' ? topProducts : stockLevels;
    if (!data?.length) return;
    downloadCsv({ filename: `${type}-report`, sections: [{ title: `${type} report`, rows: data }] });
  };

  const handleExportPDF = () => {
    openDataReportPdf({
      title: '10th West Moto — Owner Report',
      rangeLabel: dateRange,
      sections: buildOwnerReportSections({ salesReport, salesTrend, topProducts, stockLevels, profitReport, posReport, returnReport, customerActivity }),
    });
  };

  const handleExportCsv = () => {
    downloadCsv({
      filename: `owner-report_${dateRange}`,
      sections: buildOwnerReportSections({ salesReport, salesTrend, topProducts, stockLevels, profitReport, posReport, returnReport, customerActivity }),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & analytics"
        description="Real sales, product, inventory, customer, and profitability reporting."
        actions={<>
          <button onClick={handleExportPDF} disabled={loading || Boolean(error) || Boolean(warning)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Printer size={16} aria-hidden="true" /> PDF
          </button>
          <button onClick={handleExportCsv} disabled={loading || Boolean(error) || Boolean(warning)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <FileText size={16} aria-hidden="true" /> CSV for Excel
          </button>
        </>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2 sm:px-4">
        <div tabIndex={0} className="flex max-w-full gap-1 overflow-x-auto" role="group" aria-label="Report type">
          {tabs.map(t => (
            <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${tab === t.id ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <t.icon size={15} aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Date range">
            {['7d', '30d', '90d'].map(r => (
              <button key={r} aria-pressed={dateRange === r} onClick={() => setDateRange(r)} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${dateRange === r ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}</button>
            ))}
        </div>
      </div>

      {warning && !loading && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{warning} Exports are paused until the full report is available. <button type="button" onClick={fetchData} className="font-semibold underline">Retry</button></p>}

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading reports">{Array.from({ length: 3 }, (_, index) => <LoadingSkeleton key={index} className="h-24 w-full" />)}</div>
      ) : error ? (
        <EmptyState tone="error" title="Reports could not be loaded" description={error} action={<button type="button" onClick={fetchData} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">Retry</button>} />
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
                  { label: 'Avg Order', value: `₱${(salesReport?.average_order_value || 0).toFixed(0)}`, color: 'bg-slate-100 text-slate-700' },
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
                  <ChartCard title="Sales Trend" action={<button onClick={() => handleExport('sales')} disabled={Boolean(warning)} className="flex items-center gap-1 text-xs text-slate-600 disabled:opacity-50"><Download size={12} /> CSV</button>}>
                    {salesTrend.length ? <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={salesTrend}>
                        <defs><linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f36a21" stopOpacity={0.1} /><stop offset="95%" stopColor="#f36a21" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tickFormatter={formatReportDate} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <Tooltip labelFormatter={formatReportDate} formatter={(v) => [`₱${Number(v).toLocaleString()}`, '']} />
                        <Area type="monotone" dataKey="revenue" stroke="#f36a21" fill="url(#salesGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer> : <div className="grid h-[220px] place-items-center text-sm text-slate-600">No sales trend for this period.</div>}
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
              <ChartCard title="Top Selling Products" action={<button onClick={() => handleExport('products')} disabled={Boolean(warning)} className="flex items-center gap-1 text-xs text-slate-600 disabled:opacity-50"><Download size={12} /> CSV</button>}>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={topProducts.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="#9ca3af" width={120} />
                      <Tooltip formatter={(v) => [v, 'Units Sold']} />
                      <Bar dataKey="quantity_sold" fill="#f36a21" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="No product sales in this period" description="Try a longer date range to see product performance." />}
              </ChartCard>
            </div>
          )}

          {/* Inventory Tab */}
          {tab === 'inventory' && (
            <div className="space-y-4">
              <ChartCard title="Stock Level Distribution" action={<button onClick={() => handleExport('inventory')} disabled={Boolean(warning)} className="flex items-center gap-1 text-xs text-slate-600 disabled:opacity-50"><Download size={12} /> CSV</button>}>
                {stockLevels.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stockLevels.slice(0, 20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="category" tick={{ fontSize: 9 }} stroke="#9ca3af" angle={-45} textAnchor="end" height={80} />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip />
                      <Bar dataKey="total_stock" fill="#111c3d" radius={[4, 4, 0, 0]} name="Stock" />
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
                    <XAxis dataKey="date" tickFormatter={formatReportDate} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip labelFormatter={formatReportDate} formatter={(v) => [`₱${Number(v).toLocaleString()}`, '']} />
                    <Bar dataKey="revenue" fill="#f36a21" name="Revenue" radius={[4, 4, 0, 0]} />
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
                <div tabIndex={0} className="overflow-x-auto">
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
                <div tabIndex={0} className="overflow-x-auto">
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
                  <div tabIndex={0} className="overflow-x-auto">
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
                              <span className="px-2 py-0.5 bg-orange-50 text-orange-800 text-xs font-semibold rounded-full">{customer.orders}</span>
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


