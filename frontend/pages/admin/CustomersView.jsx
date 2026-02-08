import React, { useEffect, useState } from 'react';
import { getOrders } from '../../services/api';
import { Users, Search, Eye, ShoppingBag, DollarSign, Star, Mail, Phone, MapPin, Calendar, Package } from 'lucide-react';
import Modal from '../../components/admin/Modal';

const CustomersView = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const orders = await getOrders();
        const map = new Map();
        orders.forEach((o) => {
          const uid = o.user_id;
          if (!map.has(uid)) {
            map.set(uid, {
              id: uid,
              name: o.customer_name || o.shipping_name || `Customer #${uid}`,
              email: o.customer_email || o.email || '',
              phone: o.customer_phone || o.phone || '',
              orderCount: 0,
              totalSpent: 0,
              lastOrder: o.created_at,
              orders: [],
            });
          }
          const c = map.get(uid);
          c.orderCount++;
          c.totalSpent += o.total_amount || 0;
          if (new Date(o.created_at) > new Date(c.lastOrder)) c.lastOrder = o.created_at;
          c.orders.push(o);
        });
        setCustomers(Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const filtered = customers.filter(c => {
    const term = search.toLowerCase();
    return !term || c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term) || c.id.toString().includes(term);
  });

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const avgOrderValue = customers.length > 0 ? totalRevenue / customers.reduce((s, c) => s + c.orderCount, 0) : 0;
  const repeatCustomers = customers.filter(c => c.orderCount > 1).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500">Customer profiles derived from order data</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Customers', value: totalCustomers.toString(), icon: <Users size={18} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'Total Revenue', value: `₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`, icon: <DollarSign size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Avg Order Value', value: `₱${avgOrderValue.toFixed(0)}`, icon: <ShoppingBag size={18} />, color: 'bg-purple-50 text-purple-600' },
          { label: 'Repeat Customers', value: repeatCustomers.toString(), icon: <Star size={18} />, color: 'bg-amber-50 text-amber-600' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className={`w-8 h-8 ${kpi.color} rounded-lg flex items-center justify-center mb-2`}>{kpi.icon}</div>
            <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20" />
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center"><Users size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-500">No customers found</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Email</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Orders</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Total Spent</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">Last Order</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 w-20">View</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{c.name}</p>
                        <p className="text-[10px] text-gray-400">ID: {c.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{c.orderCount}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">₱{c.totalSpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">{new Date(c.lastOrder).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelectedCustomer(c)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Customer Detail Modal */}
      <Modal isOpen={!!selectedCustomer} onClose={() => setSelectedCustomer(null)} title={selectedCustomer?.name || 'Customer'} size="xl">
        {selectedCustomer && (
          <div className="space-y-5">
            {/* Profile */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-lg">{selectedCustomer.name}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                  {selectedCustomer.email && <span className="flex items-center gap-1"><Mail size={10} /> {selectedCustomer.email}</span>}
                  {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone size={10} /> {selectedCustomer.phone}</span>}
                  <span className="flex items-center gap-1"><Calendar size={10} /> Member since {new Date(selectedCustomer.orders[selectedCustomer.orders.length - 1]?.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-lg font-bold text-blue-700">{selectedCustomer.orderCount}</p>
                <p className="text-[10px] text-blue-500 font-medium">Total Orders</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-lg font-bold text-green-700">₱{selectedCustomer.totalSpent.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-green-500 font-medium">Total Spent</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-lg font-bold text-purple-700">₱{(selectedCustomer.totalSpent / selectedCustomer.orderCount).toFixed(0)}</p>
                <p className="text-[10px] text-purple-500 font-medium">Avg Order</p>
              </div>
            </div>

            {/* Order History */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">Order History</h4>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-60 overflow-y-auto">
                {selectedCustomer.orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3 hover:bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"><Package size={14} className="text-gray-400" /></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Order #{o.id.toString().padStart(4, '0')}</p>
                        <p className="text-[10px] text-gray-400">{new Date(o.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">₱{(o.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                        o.status === 'delivered' ? 'bg-green-50 text-green-600' :
                        o.status === 'pending' ? 'bg-yellow-50 text-yellow-600' :
                        o.status === 'cancelled' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                      }`}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CustomersView;
