import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { createMotorcycleModel, updateMotorcycleModel } from '../../services/api';

const emptyModel = { model_name: '', brand: '', description: '', status: 'active' };

const MotorcycleModelManager = ({ models = [], onChanged, onSelect, compact = false }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyModel);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const beginEdit = (model) => {
    setEditing(model);
    setForm({
      model_name: model.model_name || '',
      brand: model.brand || '',
      description: model.description || '',
      status: model.status || 'active',
    });
    setFeedback(null);
  };

  const reset = () => {
    setEditing(null);
    setForm(emptyModel);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = editing
        ? await updateMotorcycleModel(editing.id, form)
        : await createMotorcycleModel(form);
      setFeedback({ type: 'success', text: editing ? 'Motorcycle model updated successfully.' : 'Motorcycle model added successfully.' });
      await onChanged?.(saved);
      if (!editing) onSelect?.(saved);
      reset();
    } catch (error) {
      setFeedback({ type: 'error', text: error?.message || 'Motorcycle model could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15';
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
      {!compact && (
        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-200">
          {models.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No motorcycle models have been added yet.</p>
          ) : models.map((model) => (
            <div key={model.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{model.model_name}</p>
                <p className="text-xs text-slate-500">{model.brand || 'Any brand'} · {model.inventory_item_count || 0} inventory items · {model.status}</p>
              </div>
              <button type="button" onClick={() => beginEdit(model)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                <Pencil size={13} /> Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3 rounded-xl bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">{editing ? 'Edit Motorcycle Model' : 'Add Motorcycle Model'}</h3>
          {editing && <button type="button" onClick={reset} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Add new instead</button>}
        </div>
        <input autoFocus required value={form.model_name} onChange={(event) => setForm((current) => ({ ...current, model_name: event.target.value }))} className={fieldClass} placeholder="Model name, e.g. Mio M3" />
        <input value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} className={fieldClass} placeholder="Brand (optional)" />
        <textarea rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Description (optional)" />
        <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={fieldClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {feedback && <p role="status" className={`rounded-lg px-3 py-2 text-xs ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{feedback.text}</p>}
        <button disabled={saving} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
          <Plus size={15} /> {saving ? 'Saving…' : editing ? 'Save changes' : 'Add Motorcycle Model'}
        </button>
      </form>
    </div>
  );
};

export default MotorcycleModelManager;
