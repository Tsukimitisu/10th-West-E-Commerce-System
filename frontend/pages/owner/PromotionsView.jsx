import React, { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, X, Gift, Percent, DollarSign, Calendar, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Edit3 } from 'lucide-react';
import { getDiscounts, createDiscount, updateDiscount, deleteDiscount } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import Modal from '../../components/owner/Modal';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';

const InputField = ({ label, htmlFor, required, children }) => (
  <div>
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

const getStatus = (discount) => {
  if (!discount.is_active) return { label: 'Inactive', color: 'bg-gray-900 text-gray-600 border-gray-700' };
  if (discount.expires_at && new Date(discount.expires_at) < new Date()) return { label: 'Expired', color: 'bg-red-50 text-red-600 border-red-200' };
  if (discount.starts_at && new Date(discount.starts_at) > new Date()) return { label: 'Upcoming', color: 'bg-blue-50 text-blue-700 border-blue-200' };
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
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchDiscounts = async () => {
    try {
      const data = await getDiscounts();
      setDiscounts(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      console.error(e);
      setDiscounts([]);
      setError('Promotions could not be loaded. Please retry.');
    }
    setLoading(false);
  };

  useEffect(() => { fetchDiscounts(); }, []);

  const totalCampaigns = discounts.length;
  const activeCampaigns = discounts.filter(d => getStatus(d).label === 'Active').length;
  const totalRedemptions = discounts.reduce((sum, d) => sum + (d.used_count || 0), 0);

  const openCreate = () => {
    setEditing(null);
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

  const openEdit = (discount) => {
    setEditing(discount);
    setForm({
      code: discount.code || '',
      type: discount.type || 'percentage',
      value: String(discount.value ?? ''),
      min_purchase: String(discount.min_purchase ?? ''),
      max_uses: String(discount.max_uses ?? 0),
      starts_at: discount.starts_at ? String(discount.starts_at).slice(0, 10) : '',
      expires_at: discount.expires_at ? String(discount.expires_at).slice(0, 10) : '',
      is_active: discount.is_active !== false,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code.toUpperCase().trim(),
      type: form.type,
      value: parseFloat(form.value),
      min_purchase: form.min_purchase ? parseFloat(form.min_purchase) : 0,
      max_uses: form.max_uses && Number(form.max_uses) > 0 ? parseInt(form.max_uses, 10) : null,
      starts_at: form.starts_at || null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };
    try {
      if (editing) await updateDiscount(editing.id, payload);
      else await createDiscount(payload);
      await fetchDiscounts();
      setModalOpen(false);
    } catch (e) {
      console.error(e);
      setError(`Promotion could not be ${editing ? 'updated' : 'created'}. Check the details and try again.`);
    } finally {
      setSaving(false);
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
      <PageHeader title="Promotions & discounts" description="Manage codes, eligibility, schedule, and redemption." actions={<button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700"><Plus size={16} aria-hidden="true" /> Create promotion</button>} />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Campaigns', value: totalCampaigns.toString(), icon: <Gift size={18} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'Active Campaigns', value: activeCampaigns.toString(), icon: <CheckCircle2 size={18} />, color: 'bg-green-50 text-green-600' },
          { label: 'Total Redemptions', value: totalRedemptions.toString(), icon: <Percent size={18} />, color: 'bg-red-500/10 text-orange-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4">
            <div className={`w-8 h-8 ${stat.color} rounded-lg flex items-center justify-center mb-2`}>{stat.icon}</div>
            <div className="min-h-7 text-lg font-bold text-white">{loading ? <LoadingSkeleton className="h-6 w-16" /> : error ? '—' : stat.value}</div>
            <p className="text-xs text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Discount Codes Table */}
      <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-4" role="status" aria-label="Loading promotions">{Array.from({ length: 3 }, (_, index) => <LoadingSkeleton key={index} className="h-14 w-full" />)}</div>
        ) : discounts.length === 0 ? (
          <div className="p-6"><EmptyState icon={Tag} title="No promotions yet" description="Create a code to set its value, eligibility, and schedule." action={<button type="button" onClick={openCreate} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">Create promotion</button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <div className="divide-y divide-slate-200 md:hidden">{discounts.map((d) => { const status = getStatus(d); return <article key={d.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1 text-sm"><p className="font-semibold text-slate-950">{d.code}</p><p className="text-slate-700">{d.type === 'percentage' ? `${d.value}% off` : `₱${Number(d.value).toLocaleString()} off`} · {d.min_purchase ? `Min ₱${Number(d.min_purchase).toLocaleString()}` : 'No minimum'}</p><StatusBadge tone={status.label === 'Active' ? 'success' : status.label === 'Upcoming' ? 'info' : status.label === 'Expired' ? 'warning' : 'neutral'}>{status.label}</StatusBadge><p className="text-xs text-slate-600">{d.used_count || 0} used · {d.starts_at ? new Date(d.starts_at).toLocaleDateString() : 'Any start'} – {d.expires_at ? new Date(d.expires_at).toLocaleDateString() : 'No end'}</p></div>
              <div className="flex shrink-0 gap-1"><button type="button" onClick={() => openEdit(d)} aria-label={`Edit ${d.code}`} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"><Edit3 size={16} aria-hidden="true" /></button><button type="button" onClick={() => handleDelete(d)} aria-label={`Delete ${d.code}`} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-700 hover:bg-red-50"><Trash2 size={16} aria-hidden="true" /></button></div>
            </article>; })}</div>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Value</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 hidden md:table-cell">Min Purchase</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 hidden sm:table-cell">Usage</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden lg:table-cell">Starts</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 hidden lg:table-cell">Expires</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {discounts.map((d) => {
                  const status = getStatus(d);
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-white bg-gray-900 px-2 py-0.5 rounded text-xs">
                          {d.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600 capitalize">
                          {d.type === 'percentage' ? <Percent size={12} /> : <DollarSign size={12} />}
                          {d.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-white">
                        {d.type === 'percentage' ? `${d.value}%` : `₱${parseFloat(d.value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 hidden md:table-cell">
                        {d.min_purchase ? `₱${parseFloat(d.min_purchase).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '-'}
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
                      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">
                        {d.starts_at ? new Date(d.starts_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">
                        {d.expires_at ? new Date(d.expires_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openEdit(d)} aria-label={`Edit ${d.code}`} className="inline-grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><Edit3 size={16} /></button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          aria-label={`Delete ${d.code}`}
                          className="inline-grid h-9 w-9 place-items-center rounded-lg text-red-700 hover:bg-red-50 transition-colors"
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
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.code}` : 'Create promotion'} size="lg">

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Code */}
              <InputField label="Discount code" htmlFor="promotion-code" required>
                <input
                  id="promotion-code"
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
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Discount type" htmlFor="promotion-type" required>
                  <select
                    id="promotion-type"
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    required
                    className={inputClass}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₱)</option>
                  </select>
                </InputField>
                <InputField label={`Value ${form.type === 'percentage' ? '(%)' : '(₱)'}`} htmlFor="promotion-value" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      {form.type === 'percentage' ? '%' : '₱'}
                    </span>
                    <input
                      id="promotion-value"
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
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Minimum purchase (₱)" htmlFor="promotion-minimum">
                  <input
                    id="promotion-minimum"
                    type="number"
                    step="1"
                    min="0"
                    value={form.min_purchase}
                    onChange={e => setForm(f => ({ ...f, min_purchase: e.target.value }))}
                    placeholder="0 = no minimum"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Set to 0 or leave empty for no minimum requirement</p>
                </InputField>
                <InputField label="Maximum uses" htmlFor="promotion-max-uses">
                  <input
                    id="promotion-max-uses"
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
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Start date" htmlFor="promotion-start">
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="promotion-start"
                      type="date"
                      value={form.starts_at}
                      onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </InputField>
                <InputField label="End date" htmlFor="promotion-end">
                  <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="promotion-end"
                      type="date"
                      value={form.expires_at}
                      onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </InputField>
              </div>

              {/* Active Toggle */}
              <div className={`p-4 rounded-lg border ${form.is_active ? 'bg-green-50 border-green-200' : 'bg-gray-900 border-gray-700'}`}>
                <label className="flex items-center gap-2 font-medium text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 text-red-500 rounded focus:ring-orange-500"
                  />
                  Active
                  <span className="text-xs font-normal text-gray-400 ml-1">
                    {form.is_active ? '- Available within its scheduled dates' : '- This code is disabled'}
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white pt-4 pb-[max(0rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create promotion'}
                </button>
              </div>
            </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete promotion" size="sm">
          {deleteTarget && <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
              <h3 className="text-lg font-bold text-white">Delete Discount</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete discount code <strong>"{deleteTarget.code}"</strong>?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl">Delete</button>
            </div>
          </>}
      </Modal>
    </div>
  );
};

export default PromotionsView;


