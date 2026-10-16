import React, { useEffect, useState } from 'react';
import { getOrders, adminDeleteUser, getCustomers } from '../../services/api';
import { Users, Search, Eye, ShoppingBag, DollarSign, Star, Mail, Phone, MapPin, Calendar, Package, Trash2 } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import PageHeader from '../../components/operations/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import { getCurrentAuthUser } from '../../services/authSession.js';

const CustomersView = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [error, setError] = useState('');
  const canDeleteCustomers = getCurrentAuthUser()?.role === 'super_admin';

  useEffect(() => {
    (async () => {
      try {
        // First fetch actual customers from DB
        const [usersResp, orders] = await Promise.all([getCustomers({ page: 1 }), getOrders()]);
        const allCust = usersResp.customers || [];
        const map = new Map();
        
        // Populate map with registered users first
        allCust.forEach(u => {
          map.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || '',
            isActive: u.is_active,
            orderCount: 0,
            totalSpent: 0,
            lastOrder: null,
            orders: []
          });
        });
        
        orders.forEach((o) => {
          const uid = o.user_id;
          if (!map.has(uid)) {
            map.set(uid, {
              id: uid,
              name: o.customer_name || o.shipping_name || `Customer #${uid || 'Guest'}`,
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
          c.totalSpent += Number(o.total_amount || 0);
          if (!c.lastOrder || new Date(o.created_at) > new Date(c.lastOrder)) c.lastOrder = o.created_at;
          c.orders.push(o);
        });
        setCustomers(Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent));
        setError('');
      } catch (e) { console.error(e); setError('Customers could not be loaded. Please try again.'); }
      setLoading(false);
    })();
  }, []);

  const handleDeleteCustomer = async () => {
    if (!deleteId) return;
    try {
      await adminDeleteUser(deleteId);
      setCustomers(customers.filter(c => c.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      console.error('Failed to delete customer', err);
      alert(err.message || 'Failed to delete customer');
    }
  };

  const filtered = customers.filter(c => {
    const term = search.toLowerCase();
    return !term || c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term) || c.id.toString().includes(term);
  });

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const orderCount = customers.reduce((s, c) => s + c.orderCount, 0);
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
  const repeatCustomers = customers.filter(c => c.orderCount > 1).length;
  const customerToDelete = deleteId ? customers.find(c => c.id === deleteId) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" description="Search accounts, contact details, and order activity." />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Customers', value: totalCustomers.toString(), icon: <Users size={18} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'Total Revenue', value: `₱${totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`, icon: <DollarSign size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Avg Order Value', value: `₱${avgOrderValue.toFixed(0)}`, icon: <ShoppingBag size={18} />, color: 'bg-slate-100 text-slate-700' },
          { label: 'Repeat Customers', value: repeatCustomers.toString(), icon: <Star size={18} />, color: 'bg-amber-50 text-amber-600' },
        ].map((kpi, i) => (
          <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className={`w-8 h-8 ${kpi.color} rounded-lg flex items-center justify-center mb-2`}>{kpi.icon}</div>
            <div className="min-h-7 text-lg font-bold text-white">{loading ? <LoadingSkeleton className="h-6 w-20" /> : error ? '—' : kpi.value}</div>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <label htmlFor="owner-customer-search" className="sr-only">Search customers</label>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input id="owner-customer-search" type="search" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
      </div>

      {/* Customers Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-4" role="status" aria-label="Loading customers">{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-6"><EmptyState icon={Users} tone={error ? 'error' : undefined} title={error ? 'Customers unavailable' : 'No customers found'} description={error || (search ? 'Try a different name or email.' : 'Customer accounts will appear here.')} /></div>
        ) : (
          <><div className="divide-y divide-slate-200 md:hidden">{filtered.map((c) => <article key={c.id} className="flex items-start justify-between gap-3 p-4 text-sm">
            <div className="min-w-0 space-y-1"><p className="font-semibold text-slate-950">{c.name}</p><p className="break-all text-slate-600">{c.email || c.phone || 'No contact on file'}</p><p className="text-slate-600">{c.isActive === false ? 'Inactive' : c.isActive === true ? 'Active' : 'Status unavailable'} · {c.orderCount} orders · ₱{c.totalSpent.toLocaleString('en-PH')}</p><p className="text-xs text-slate-600">Last order: {c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : 'None'}</p></div>
            <button type="button" onClick={() => setSelectedCustomer(c)} aria-label={`View ${c.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"><Eye size={18} /></button>
          </article>)}</div><table className="hidden w-full text-sm md:table">
            <thead><tr className="bg-gray-50/80 border-b border-gray-700">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden lg:table-cell">Status</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Orders</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Total Spent</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden sm:table-cell">Last Order</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 w-auto">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">{c.name}</p>
                        <p className="text-[10px] text-gray-400">ID: {c.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{c.email || c.phone || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 hidden lg:table-cell">{c.isActive === false ? 'Inactive' : c.isActive === true ? 'Active' : 'Unknown'}</td>
                  <td className="px-4 py-3 text-right font-medium text-white">{c.orderCount}</td>
                  <td className="px-4 py-3 text-right font-bold text-white">₱{c.totalSpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">{c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : 'Never'}</td>
                  <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setSelectedCustomer(c)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title={`View ${c.name}`}><Eye size={14} /></button>
                          {canDeleteCustomers && <button onClick={() => setDeleteId(c.id)} className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors text-xs font-medium"><Trash2 size={13} /> Delete {c.name}</button>}
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></>
        )}
      </div>
        {/* Delete Confirmation Modal */}
        {deleteId && customerToDelete && (
          <Modal isOpen={true} onClose={() => setDeleteId(null)} title="Confirm Deletion">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete {customerToDelete.name}?</h3>
              <p className="text-gray-500 mb-6">Are you sure you want to delete the account for <strong>{customerToDelete.name}</strong>? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleDeleteCustomer} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
                  Delete Account
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Customer Detail Modal */}
      <Modal isOpen={!!selectedCustomer} onClose={() => setSelectedCustomer(null)} title={selectedCustomer?.name || 'Customer'} size="xl">
        {selectedCustomer && (
          <div className="space-y-5">
            {/* Profile */}
            <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-lg">
              <div className="w-14 h-14 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-lg">{selectedCustomer.name}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                  {selectedCustomer.email && <span className="flex items-center gap-1"><Mail size={10} /> {selectedCustomer.email}</span>}
                  {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone size={10} /> {selectedCustomer.phone}</span>}
                  <span className="flex items-center gap-1"><Calendar size={12} /> Last order {selectedCustomer.lastOrder ? new Date(selectedCustomer.lastOrder).toLocaleDateString() : 'never'}</span>
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
              <div className="text-center p-3 bg-slate-100 rounded-lg">
                <p className="text-lg font-bold text-slate-700">₱{(selectedCustomer.orderCount ? selectedCustomer.totalSpent / selectedCustomer.orderCount : 0).toFixed(0)}</p>
                <p className="text-[10px] text-slate-700 font-medium">Avg Order</p>
              </div>
            </div>

            {/* Order History */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">Order History</h4>
              <div className="border border-gray-700 rounded-lg divide-y divide-gray-50 max-h-60 overflow-y-auto">
                {selectedCustomer.orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3 hover:bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"><Package size={14} className="text-gray-400" /></div>
                      <div>
                        <p className="text-sm font-medium text-white">Order #{o.id.toString().padStart(4, '0')}</p>
                        <p className="text-[10px] text-gray-400">{new Date(o.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">₱{(o.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                        o.status === 'delivered' ? 'bg-green-50 text-green-600' :
                        o.status === 'pending' ? 'bg-yellow-50 text-yellow-600' :
                        o.status === 'cancelled' ? 'bg-red-500/10 text-red-500' : 'bg-blue-50 text-blue-600'
                      }`}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-gray-700 flex justify-end">
              {canDeleteCustomers && <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setDeleteId(selectedCustomer.id);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-lg transition-colors font-medium text-sm"
              >
                <Trash2 size={16} /> Delete {selectedCustomer.name}
              </button>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CustomersView;



