import React, { useEffect, useState } from 'react';
import { getSalesReport, getSalesByChannel, getTopProducts, getDailySalesTrend, getStockLevelsReport, getProfitReport } from '../../services/api';
import { BarChart3, Download, Calendar, TrendingUp, Package, DollarSign, ShoppingBag, Boxes } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import ChartCard from '../../components/admin/ChartCard';

const ReportsView: React.FC = () => {
  const [tab, setTab] = useState<'sales' | 'products' | 'inventory' | 'financial'>('sales');
  const [dateRange, setDateRange] = useState('30d');
  const [salesReport, setSalesReport] = useState<any>(null);
  const [channelData, setChannelData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  const [profitReport, setProfitReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sales, channels, top, trend, stock, profit] = await Promise.all([
        getSalesReport(dateRange).catch(() => null),
        getSalesByChannel().catch(() => []),
        getTopProducts(10).catch(() => []),
        getDailySalesTrend(dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90).catch(() => []),
        getStockLevelsReport().catch(() => []),
        getProfitReport(dateRange).catch(() => null),
      ]);
      setSalesReport(sales); setChannelData(Array.isArray(channels) ? channels : []);
      setTopProducts(Array.isArray(top) ? top : []); setSalesTrend(Array.isArray(trend) ? trend : []);
      setStockLevels(Array.isArray(stock) ? stock : []); setProfitReport(profit);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateRange]);

  const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ec4899', '#0891b2', '#65a30d'];

  const tabs = [
    { id: 'sales', label: 'Sales', icon: TrendingUp },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'financial', label: 'Financial', icon: DollarSign },
  ] as const;

  const handleExport = (type: string) => {
    const data = type === 'sales' ? salesTrend : type === 'products' ? topProducts : stockLevels;
    if (!data?.length) return;
    const header = Object.keys(data[0]).join(',');
    const rows = data.map((r: any) => Object.values(r).join(',')).join('\n');
    const blob = new Blob([header + '\n' + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${type}-report.csv`; a.click();
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
          <div className="flex bg-white rounded-lg border border-gray-100 p-0.5">
            {['7d', '30d', '90d'].map(r => (
              <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${dateRange === r ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>{r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto" /></div>
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
                        <defs><linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={0.1} /><stop offset="95%" stopColor="#dc2626" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <Tooltip formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, '']} />
                        <Area type="monotone" dataKey="revenue" stroke="#dc2626" fill="url(#salesGrad)" strokeWidth={2} />
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
                      <Tooltip formatter={(v: any) => [v, 'Units Sold']} />
                      <Bar dataKey="quantity_sold" fill="#dc2626" radius={[0, 4, 4, 0]} />
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
                        {topProducts.map((p: any, i: number) => (
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

              <ChartCard title="Revenue vs Cost">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesTrend.map(d => ({ ...d, cost: (d as any).cost || ((d as any).revenue || 0) * 0.6 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, '']} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#dc2626" name="Revenue" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" fill="#9ca3af" name="Cost" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportsView;
