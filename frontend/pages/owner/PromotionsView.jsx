import React, { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, X, Gift, Percent, DollarSign, Calendar, CheckCircle2, XCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { getDiscounts, createDiscount, deleteDiscount } from '../../services/api';

const InputField = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {label}{required && <span className="text-orange-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300";

const getStatus = (discount) => {
  if (!discount.is_active) return { label: 'Inactive', color: 'bg-gray-50 text-gray-600 border-gray-200' };
  if (discount.expires_at && new Date(discount.expires_at) < new Date()) return { label: 'Expired', color: 'bg-red-50 text-red-600 border-red-200' };
  return { label: 'Active', color: 'bg-green-50 text-green-600 border-green-200' };
};

const PromotionsView = () => {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'percentage',
    value: '',
    min_purchase: '',
    max_uses: '0',
    starts_at: '',
    expires_at: '',
    is_active: true,
  });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchDiscounts = async () => {
    try {
      const data = await getDiscounts();
      setDiscounts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setDiscounts([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDiscounts(); }, []);

  const totalCampaigns = discounts.length;
  const activeCampaigns = discounts.filter(d => d.is_active).length;
  const totalRedemptions = discounts.reduce((sum, d) => sum + (d.used_count || 0), 0);

  const openCreate = () => {
    setForm({
      code: '',
      type: 'percentage',
      value: '',
      min_purchase: '',
      max_uses: '0',
      starts_at: '',
      expires_at: '',
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      code: form.code.toUpperCase().trim(),
      type: form.type,
      value: parseFloat(form.value),
      min_purchase: form.min_purchase ? parseFloat(form.min_purchase) : null,
      max_uses: parseInt(form.max_uses) || 0,
      starts_at: form.starts_at || null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };
    try {
      await createDiscount(payload);
      fetchDiscounts();
      setModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = (discount) => {
    setDeleteTarget(discount);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDiscount(deleteTarget.id);
      fetchDiscounts();
    } catch (e) {
      console.error(e);
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-xl flex items-center justify-center">
            <Tag size={20} />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-gray-900">Promotions & Discounts</h1>
            <p className="text-sm text-gray-500">Manage discount codes, coupons, and campaigns</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Create New
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Campaigns', value: totalCampaigns.toString(), icon: <Gift size={18} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'Active Campaigns', value: activeCampaigns.toString(), icon: <CheckCircle2 size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Total Redemptions', value: totalRedemptions.toString(), icon: <Percent size={18} />, color: 'bg-orange-50 text-orange-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className={`w-8 h-8 ${stat.color} rounded-lg flex items-center justify-center mb-2`}>{stat.icon}</div>
            <p className="text-lg font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Discount Codes Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : discounts.length === 0 ? (
          <div className="p-12 text-center">
            <Tag size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No discount codes yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first promotion to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Value</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Min Purchase</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">Usage</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden lg:table-cell">Starts</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden lg:table-cell">Expires</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {discounts.map((d) => {
                  const status = getStatus(d);
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded text-xs">
                          {d.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600 capitalize">
                          {d.type === 'percentage' ? <Percent size={12} /> : <DollarSign size={12} />}
                          {d.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {d.type === 'percentage' ? `${d.value}%` : `₱${parseFloat(d.value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                        {d.min_purchase ? `₱${parseFloat(d.min_purchase).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-xs text-gray-600">
                          {d.used_count || 0} / {d.max_uses === 0 || !d.max_uses ? '∞' : d.max_uses}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${status.color}`}>
                          {status.label === 'Active' && <CheckCircle2 size={10} />}
                          {status.label === 'Expired' && <AlertCircle size={10} />}
                          {status.label === 'Inactive' && <XCircle size={10} />}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                        {d.starts_at ? new Date(d.starts_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                        {d.expires_at ? new Date(d.expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(d)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center">
                  <Tag size={16} />
                </div>
                <h2 className="text-base font-bold text-gray-900">Create Discount Code</h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Code */}
              <InputField label="Discount Code" required>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  required
                  placeholder="e.g. SUMMER25"
                  className={inputClass}
                  style={{ textTransform: 'uppercase' }}
                />
              </InputField>

              {/* Type & Value */}
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Discount Type" required>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    required
                    className={inputClass}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₱)</option>
                  </select>
                </InputField>
                <InputField label={`Value ${form.type === 'percentage' ? '(%)' : '(₱)'}`} required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      {form.type === 'percentage' ? '%' : '₱'}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      required
                      placeholder="0"
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                </InputField>
              </div>

              {/* Min Purchase & Max Uses */}
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Minimum Purchase (₱)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.min_purchase}
                    onChange={e => setForm(f => ({ ...f, min_purchase: e.target.value }))}
                    placeholder="No minimum"
                    className={inputClass}
                  />
                </InputField>
                <InputField label="Maximum Uses">
                  <input
                    type="number"
                    min="0"
                    value={form.max_uses}
                    onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                    placeholder="0 = unlimited"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">0 = unlimited uses</p>
                </InputField>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Start Date">
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={form.starts_at}
                      onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </InputField>
                <InputField label="Expiry Date">
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={form.expires_at}
                      onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </InputField>
              </div>

              {/* Active Toggle */}
              <div className={`p-4 rounded-lg border ${form.is_active ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <label className="flex items-center gap-2 font-medium text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                  />
                  Active
                  <span className="text-xs font-normal text-gray-500 ml-1">
                    {form.is_active ? '— This code can be used immediately' : '— This code is disabled'}
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Create Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900">Delete Discount</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete discount code <strong>"{deleteTarget.code}"</strong>?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromotionsView;
