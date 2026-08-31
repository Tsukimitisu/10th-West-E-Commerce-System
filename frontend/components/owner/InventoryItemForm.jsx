import React, { useMemo, useState } from 'react';

const emptyItem = {
  part_number: '',
  product_name: '',
  brand: '',
  motorcycle_model: '',
  category_id: '',
  store_selling_price: '',
  cost_price: '',
  quantity: 0,
  minimum_stock: 5,
  box_location: '',
  description: '',
  status: 'active',
};

const InventoryItemForm = ({ initialItem, initialPartNumber = '', categories = [], onSubmit, onCancel }) => {
  const initial = useMemo(() => ({
    ...emptyItem,
    ...initialItem,
    part_number: initialItem?.part_number || initialPartNumber || '',
    product_name: initialItem?.product_name || initialItem?.name || '',
    store_selling_price: initialItem?.store_selling_price ?? initialItem?.price ?? '',
    cost_price: initialItem?.cost_price ?? initialItem?.buying_price ?? '',
    quantity: initialItem?.quantity ?? initialItem?.stock_quantity ?? 0,
    minimum_stock: initialItem?.minimum_stock ?? initialItem?.low_stock_threshold ?? 5,
    box_location: initialItem?.box_location || initialItem?.box_number || '',
    status: initialItem?.inventory_status || initialItem?.status || 'active',
  }), [initialItem, initialPartNumber]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = Boolean(initialItem?.id);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const onlinePrice = Number.isFinite(Number(form.store_selling_price))
    ? Math.round(Number(form.store_selling_price) * 1.15 * 100) / 100
    : 0;

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        category_id: form.category_id || null,
        quantity: Number(form.quantity),
        minimum_stock: Number(form.minimum_stock),
        store_selling_price: Number(form.store_selling_price),
        cost_price: Number(form.cost_price),
      });
    } catch (submitError) {
      setError(submitError?.message || 'Inventory item could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15';
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">Part Number
          <input required autoFocus value={form.part_number} onChange={(event) => set('part_number', event.target.value.toUpperCase())} className={fieldClass} placeholder="BB3-F1711-00" />
        </label>
        <label className="text-xs font-semibold text-slate-700">Product Name
          <input required value={form.product_name} onChange={(event) => set('product_name', event.target.value)} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-slate-700">Brand
          <input value={form.brand} onChange={(event) => set('brand', event.target.value)} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-slate-700">Motorcycle Model
          <input value={form.motorcycle_model} onChange={(event) => set('motorcycle_model', event.target.value)} className={fieldClass} placeholder="Mio M3" />
        </label>
        <label className="text-xs font-semibold text-slate-700">Category
          <select value={form.category_id || ''} onChange={(event) => set('category_id', event.target.value)} className={fieldClass}>
            <option value="">Uncategorized</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">Box Location
          <input value={form.box_location} onChange={(event) => set('box_location', event.target.value)} className={fieldClass} placeholder="Box A03" />
        </label>
        <label className="text-xs font-semibold text-slate-700">Store Selling Price
          <input required type="number" min="0" step="0.01" value={form.store_selling_price} onChange={(event) => set('store_selling_price', event.target.value)} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-slate-700">Cost Price
          <input required type="number" min="0" step="0.01" value={form.cost_price} onChange={(event) => set('cost_price', event.target.value)} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-slate-700">{editing ? 'Current Quantity' : 'Initial Quantity'}
          <input required type="number" min="0" step="1" disabled={editing} value={form.quantity} onChange={(event) => set('quantity', event.target.value)} className={`${fieldClass} disabled:bg-slate-100 disabled:text-slate-500`} />
          {editing && <span className="mt-1 block text-[11px] font-normal text-slate-500">Use a stock adjustment or Receive Stock to change quantity.</span>}
        </label>
        <label className="text-xs font-semibold text-slate-700">Minimum Stock
          <input required type="number" min="0" step="1" value={form.minimum_stock} onChange={(event) => set('minimum_stock', event.target.value)} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-slate-700">Status
          <select value={form.status} onChange={(event) => set('status', event.target.value)} className={fieldClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </label>
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">Calculated online price</p>
          <p className="mt-1 text-lg font-bold text-slate-950">₱{onlinePrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-slate-600">Automatically 15% above the store selling price.</p>
        </div>
      </div>
      <label className="block text-xs font-semibold text-slate-700">Inventory Description
        <textarea rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} className={fieldClass} />
      </label>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
        <button disabled={saving} type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
          {saving ? 'Saving…' : editing ? 'Save Inventory Item' : 'Create Inventory Item'}
        </button>
      </div>
    </form>
  );
};

export default InventoryItemForm;
