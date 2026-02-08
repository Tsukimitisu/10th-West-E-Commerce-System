import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { Download, Calendar, DollarSign, ShoppingBag, TrendingUp, Package, Users, CreditCard } from 'lucide-react';

const COLORS = ['#ea580c', '#334155', '#10b981', '#f59e0b', '#6366f1', '#ec4899'];

const ReportsView = ({ stats }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState('30days');

  const handleExport = () => {
      alert("Generating report PDF... (Simulation)");
  };

  const KPICard = ({ title, value, subtext, icon: Icon, color }) => (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
          <div>
              <p className="text-sm font-medium text-gray-500">{title}</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
              {subtext && <p className={`text-xs mt-1 ${subtext.includes('+') ? 'text-green-600' : 'text-gray-400'}`}>{subtext}</p>}
          </div>
          <div className={`p-3 rounded-lg ${color}`}>
              <Icon className="w-6 h-6 text-white" />
          </div>
      </div>
  );

  return (
    <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm">
            <div className="flex space-x-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
                {['overview', 'sales', 'inventory', 'financial', 'customers'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTabtab}
                        className={`px-4 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition-colors ${
                            activeTab === tab ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
            <div className="flex items-center space-x-2 w-full sm:w-auto">
                <select 
                    className="border-gray-300 border rounded-lg text-sm p-2 focus:ring-orange-500 focus:border-orange-500"
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                >
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="90days">Last Quarter</option>
                    <option value="year">This Year</option>
                </select>
                <button onClick={handleExport} className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700">
                    <Download className="w-4 h-4 mr-2" /> Export
                </button>
            </div>
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICard title="Total Revenue" value={`$${stats.totalSales.toLocaleString()}`} subtext="+12.5% vs last period" icon={DollarSign} color="bg-green-500" />
                    <KPICard title="Total Orders" value={stats.totalOrders} subtext="+5% new customers" icon={ShoppingBag} color="bg-blue-500" />
                    <KPICard title="Net Profit" value={`$${stats.totalProfit.toLocaleString()}`} subtext="32% margin" icon={TrendingUp} color="bg-indigo-500" />
                    <KPICard title="Low Stock Items" value={stats.lowStockCount} subtext="Requires attention" icon={Package} color="bg-red-500" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-900 mb-6">Revenue Trend</h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.salesTrend}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ea580c" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="amount" stroke="#ea580c" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-900 mb-6">Sales by Channel</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.salesByChannel}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.salesByChannel.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </>
        )}

        {/* SALES TAB */}
        {activeTab === 'sales' && (
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-900 mb-6">Sales by Category</h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.salesByCategory} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                                    <Tooltip cursor={{fill: 'transparent'}} />
                                    <Bar dataKey="value" fill="#334155" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-900 mb-6">Top Selling Products</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Product</th>
                                        <th className="px-4 py-2 text-right">Sold</th>
                                        <th className="px-4 py-2 text-right">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.topProducts.map((p, i) => (
                                        <tr key={i}>
                                            <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                                            <td className="px-4 py-3 text-right text-gray-600">{p.quantity}</td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900">${p.revenue.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* INVENTORY TAB */}
        {activeTab === 'inventory' && (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-6">Inventory Valuation by Category</h3>
                    <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.inventoryValuation}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="category" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                                <Legend />
                                <Bar dataKey="value" name="Stock Value ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {stats.inventoryValuation.slice(0, 3).map((cat, i) => (
                        <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h4 className="text-gray-500 text-sm font-medium">{cat.category}</h4>
                            <p className="text-2xl font-bold text-gray-900 mt-2">${cat.value.toLocaleString()}</p>
                            <p className="text-sm text-gray-400 mt-1">{cat.count} units in stock</p>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* FINANCIAL TAB */}
        {activeTab === 'financial' && (
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-900 mb-6">Payment Methods</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.paymentMethods}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={0}
                                        outerRadius={80}
                                        dataKey="total"
                                        nameKey="method"
                                        label={({cx, cy, midAngle, innerRadius, outerRadius, percent}) => {
                                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                            const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                                            const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                                            return `${(percent * 100).toFixed(0)}%`;
                                        }}
                                    >
                                        {stats.paymentMethods.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-900 mb-6">Profit Analysis</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.salesTrend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Area type="monotone" dataKey="amount" name="Revenue" stackId="1" stroke="#ea580c" fill="#ea580c" />
                                    <Area type="monotone" dataKey="profit" name="Profit" stackId="2" stroke="#10b981" fill="#10b981" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* CUSTOMERS TAB */}
        {activeTab === 'customers' && (
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-6">New Customer Acquisition</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={stats.customerGrowth}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip />
                                <Line type="monotone" dataKey="newCustomers" stroke="#6366f1" strokeWidth={3} dot={{r: 4}} activeDot={{r: 8}} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <KPICard title="Average Order Value" value={`$${stats.avgOrderValue.toFixed(2)}`} subtext="Per transaction" icon={CreditCard} color="bg-purple-500" />
                    <KPICard title="Customer Base" value="1,204" subtext="+24 this month" icon={Users} color="bg-pink-500" />
                </div>
            </div>
        )}
    </div>
  );
};

export default ReportsView;