import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronRight, Search, Eye, RotateCcw, Calendar, Truck, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { getUserOrders } from '../services/api';
import AccountLayout from '../components/AccountLayout';

const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
  pending:    { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  processing: { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  shipped:    { icon: Truck, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  delivered:  { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  cancelled:  { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  refunded:   { icon: AlertTriangle, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
};

const OrderHistory: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const userData = localStorage.getItem('shopCoreUser');
        const user = userData ? JSON.parse(userData) : null;
        if (!user) { setLoading(false); return; }
        const data = await getUserOrders(user.id);
        setOrders(data);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const filtered = orders.filter(o => {
    const matchesSearch = !search || o.id?.toString().includes(search) || o.order_number?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || o.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <AccountLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display font-semibold text-lg text-gray-900 flex items-center gap-2"><Package size={20} /> My Orders</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
              <option value="all">All Orders</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                <div className="flex justify-between"><div className="h-4 bg-gray-200 rounded w-24" /><div className="h-4 bg-gray-200 rounded w-16" /></div>
                <div className="h-3 bg-gray-200 rounded w-40 mt-3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Package size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">No orders found</h3>
            <p className="text-sm text-gray-500 mb-4">{search || filter !== 'all' ? 'Try adjusting your filters.' : "You haven't placed any orders yet."}</p>
            <Link to="/shop" className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(order => {
              const st = statusConfig[order.status] || statusConfig.pending;
              const StatusIcon = st.icon;
              const date = new Date(order.created_at || order.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
              return (
                <Link key={order.id} to={`/orders/${order.id}`}
                  className="block bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm p-5 transition-all group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">Order #{order.order_number || order.id}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-full text-xs font-medium capitalize ${st.bg} ${st.color}`}>
                          <StatusIcon size={12} /> {order.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Calendar size={12} /> {date}</span>
                        <span>{order.items?.length || order.item_count || '—'} items</span>
                      </div>
                      {order.items && order.items.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          {order.items.slice(0, 4).map((item: any, i: number) => (
                            <div key={i} className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0">
                              {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> :
                                <div className="w-full h-full flex items-center justify-center"><Package size={14} className="text-gray-400" /></div>}
                            </div>
                          ))}
                          {order.items.length > 4 && <span className="text-xs text-gray-400">+{order.items.length - 4} more</span>}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-gray-900">₱{Number(order.total || order.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-red-500 ml-auto mt-1 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AccountLayout>
  );
};

export default OrderHistory;
