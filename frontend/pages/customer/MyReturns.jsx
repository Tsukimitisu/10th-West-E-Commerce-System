import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Package, Clock, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import AccountLayout from '../../components/customer/AccountLayout';
import { getMyReturns } from '../../services/api';

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  approved: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-200' },
};

const MyReturns = () => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getMyReturns();
        setReturns(Array.isArray(data) ? data : []);
      } catch {
        setReturns([]);
      }
      setLoading(false);
    };

    load();
  }, []);

  return (
    <AccountLayout>
      <div className="space-y-4">
        <h2 className="font-display font-semibold text-lg text-gray-900 flex items-center gap-2"><RotateCcw size={20} className="text-red-500" /> My Returns</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : returns.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
            <RotateCcw size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">No returns</h3>
            <p className="text-sm text-gray-500 mb-4">You haven't requested any returns yet.</p>
            <Link to="/orders" className="text-sm text-red-600 hover:text-red-700 font-medium">View your orders</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {returns.map((ret) => {
              const st = statusConfig[ret.status] || statusConfig.pending;
              const StatusIcon = st.icon;
              const date = new Date(ret.created_at || ret.date).toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <div key={ret.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">Return #{ret.id}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-full text-xs font-medium capitalize ${st.bg} ${st.color}`}>
                          <StatusIcon size={12} /> {ret.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={12} /> {date}</p>
                      {ret.order_id && <p className="text-xs text-gray-500">Order #{ret.order_id}</p>}
                      {ret.reason && <p className="text-sm text-gray-600 mt-1">{ret.reason}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {ret.refund_amount > 0 && (
                        <p className="font-semibold text-gray-900 text-sm">
                          â‚±{Number(ret.refund_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>
                  {ret.items && ret.items.length > 0 && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                      {ret.items.map((item, i) => (
                        <div key={i} className="w-10 h-10 rounded-lg bg-gray-100 border border-slate-200 overflow-hidden">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package size={12} className="text-gray-400" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AccountLayout>
  );
};

export default MyReturns;


