import React, { useState, useEffect } from 'react';
import { getProductVariants, addVariant, updateVariant, deleteVariant } from '../../services/api';
import Modal from './Modal';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';

const VariantsModal = ({ isOpen, onClose, product }) => {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  
  // New Variant Form State
  const [variantType, setVariantType] = useState('size'); // e.g. 'size', 'color'
  const [variantValue, setVariantValue] = useState('');
  const [additionalPrice, setAdditionalPrice] = useState('0');
  const [stockQuantity, setStockQuantity] = useState('0');

  // Edit Variant Form State
  const [editForm, setEditForm] = useState(null);

  useEffect(() => {
    if (isOpen && product?.id) {
      fetchVariants();
    } else {
      setVariants([]);
    }
  }, [isOpen, product]);

  const fetchVariants = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getProductVariants(product.id);
      setVariants(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load variants');
    }
    setLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!variantValue.trim()) return;
    try {
      setError('');
      await addVariant({
        product_id: product.id,
        variant_type: variantType,
        variant_value: variantValue,
        additional_price: parseFloat(additionalPrice) || 0,
        stock_quantity: parseInt(stockQuantity, 10) || 0
      });
      setVariantValue('');
      setAdditionalPrice('0');
      setStockQuantity('0');
      fetchVariants();
    } catch (err) {
      setError(err.message || 'Failed to add variant');
    }
  };

  const startEdit = (v) => {
    setEditingId(v.id);
    setEditForm({
      variant_type: v.variant_type,
      variant_value: v.variant_value,
      additional_price: v.additional_price?.toString() || '0',
      stock_quantity: v.stock_quantity?.toString() || '0'
    });
  };

  const handleUpdate = async (id) => {
    if (!editForm.variant_value.trim()) return;
    try {
      setError('');
      await updateVariant(id, {
        variant_type: editForm.variant_type,
        variant_value: editForm.variant_value,
        additional_price: parseFloat(editForm.additional_price) || 0,
        stock_quantity: parseInt(editForm.stock_quantity, 10) || 0
      });
      setEditingId(null);
      setEditForm(null);
      fetchVariants();
    } catch (err) {
      setError(err.message || 'Failed to update variant');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this variant?")) return;
    try {
      setError('');
      await deleteVariant(id);
      fetchVariants();
    } catch (err) {
      setError(err.message || 'Failed to delete variant');
    }
  };

  if (!isOpen || !product) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Variants - ${product.name}`}>
      <div className="space-y-4">
        {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
        
        {/* Add new */}
        <form onSubmit={handleAdd} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs text-gray-400 mb-1">Type (Size/Color)</label>
            <input value={variantType} onChange={e => setVariantType(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white" placeholder="e.g. Size" />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs text-gray-400 mb-1">Value</label>
            <input value={variantValue} onChange={e => setVariantValue(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white" placeholder="e.g. XL" required />
          </div>
          <div className="w-24">
            <label className="block text-xs text-gray-400 mb-1">+ Price ₱</label>
            <input type="number" step="0.01" value={additionalPrice} onChange={e => setAdditionalPrice(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white" />
          </div>
          <div className="w-24">
            <label className="block text-xs text-gray-400 mb-1">Stock</label>
            <input type="number" value={stockQuantity} onChange={e => setStockQuantity(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white" />
          </div>
          <button type="submit" className="h-9 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
            <Plus size={16} /> Add
          </button>
        </form>

        {/* Existing List */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">+ Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr><td colSpan="5" className="p-4 text-center">Loading...</td></tr>
              ) : variants.length === 0 ? (
                <tr><td colSpan="5" className="p-4 text-center text-gray-500">No variants added yet.</td></tr>
              ) : (
                variants.map(v => (
                  <tr key={v.id} className="hover:bg-gray-800/50 transition-colors">
                    {editingId === v.id ? (
                      <>
                        <td className="p-2"><input value={editForm.variant_type} onChange={e => setEditForm({...editForm, variant_type: e.target.value})} className="w-full px-2 py-1 bg-black border border-gray-700 rounded text-sm text-white" /></td>
                        <td className="p-2"><input value={editForm.variant_value} onChange={e => setEditForm({...editForm, variant_value: e.target.value})} className="w-full px-2 py-1 bg-black border border-gray-700 rounded text-sm text-white" /></td>
                        <td className="p-2"><input type="number" value={editForm.additional_price} onChange={e => setEditForm({...editForm, additional_price: e.target.value})} className="w-full px-2 py-1 bg-black border border-gray-700 rounded text-sm text-white" /></td>
                        <td className="p-2"><input type="number" value={editForm.stock_quantity} onChange={e => setEditForm({...editForm, stock_quantity: e.target.value})} className="w-full px-2 py-1 bg-black border border-gray-700 rounded text-sm text-white" /></td>
                        <td className="p-2 text-right">
                          <button onClick={() => handleUpdate(v.id)} className="p-1.5 text-green-500 hover:bg-green-500/10 rounded mr-1"><Check size={16} /></button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-500 hover:bg-gray-800 rounded"><X size={16} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 capitalize">{v.variant_type}</td>
                        <td className="px-4 py-3 font-medium text-white">{v.variant_value}</td>
                        <td className="px-4 py-3 text-green-400">₱{parseFloat(v.additional_price || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${v.stock_quantity > 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {v.stock_quantity} in stock
                          </span>
                        </td>
                        <td className="px-4 py-3 flex justify-end gap-1">
                          <button onClick={() => startEdit(v)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => handleDelete(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded transition-colors"><Trash2 size={14} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

export default VariantsModal;
