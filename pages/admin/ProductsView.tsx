import React, { useEffect, useState } from 'react';
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct } from '../../services/api';
import { Product, Category } from '../../types';
import { Plus, Pencil, Trash2, Search, Package, Eye, EyeOff, Copy, Download, Upload, Filter, MoreVertical, Image as ImageIcon } from 'lucide-react';
import Modal from '../../components/admin/Modal';
import { useSocketEvent } from '../../context/SocketContext';

const ProductsView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({
    partNumber: '', name: '', description: '', price: '', buyingPrice: '',
    category_id: '', image: '', stock_quantity: '0', boxNumber: '',
    low_stock_threshold: '5', sale_price: '', is_on_sale: false, sku: '', barcode: '',
    brand: ''
  });

  const fetch = async () => {
    try {
      const [p, c] = await Promise.all([getProducts(), getCategories()]);
      setProducts(p); setCategories(c);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  // Real-time: refresh on product/inventory changes
  useSocketEvent('product:created', fetch);
  useSocketEvent('product:updated', fetch);
  useSocketEvent('product:deleted', fetch);
  useSocketEvent('inventory:updated', fetch);

  const openAdd = () => {
    setEditing(null);
    setForm({ partNumber: '', name: '', description: '', price: '', buyingPrice: '', category_id: categories[0]?.id.toString() || '', image: '', stock_quantity: '0', boxNumber: '', low_stock_threshold: '5', sale_price: '', is_on_sale: false, sku: '', barcode: '', brand: '' });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      partNumber: p.partNumber || '', name: p.name, description: p.description || '', price: p.price.toString(),
      buyingPrice: p.buyingPrice.toString(), category_id: p.category_id.toString(), image: p.image || '',
      stock_quantity: p.stock_quantity.toString(), boxNumber: p.boxNumber || '',
      low_stock_threshold: p.low_stock_threshold.toString(), sale_price: p.sale_price?.toString() || '',
      is_on_sale: p.is_on_sale || false, sku: p.sku || '', barcode: p.barcode || '', brand: p.brand || ''
    });
    setModalOpen(true);
  };

  const handleDuplicate = (p: Product) => {
    setEditing(null);
    setForm({
      partNumber: '', name: `${p.name} (Copy)`, description: p.description || '', price: p.price.toString(),
      buyingPrice: p.buyingPrice.toString(), category_id: p.category_id.toString(), image: p.image || '',
      stock_quantity: '0', boxNumber: p.boxNumber || '', low_stock_threshold: p.low_stock_threshold.toString(),
      sale_price: p.sale_price?.toString() || '', is_on_sale: false, sku: '', barcode: '', brand: p.brand || ''
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      partNumber: form.partNumber, name: form.name, description: form.description,
      price: parseFloat(form.price), buyingPrice: parseFloat(form.buyingPrice),
      category_id: parseInt(form.category_id), image: form.image, stock_quantity: parseInt(form.stock_quantity),
      boxNumber: form.boxNumber, low_stock_threshold: parseInt(form.low_stock_threshold),
      sale_price: form.sale_price ? parseFloat(form.sale_price) : undefined,
      is_on_sale: form.is_on_sale, sku: form.sku, barcode: form.barcode, brand: form.brand
    };
    try {
      if (editing) await updateProduct(editing.id, payload);
      else await createProduct(payload);
      setModalOpen(false); fetch();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try { await deleteProduct(p.id); fetch(); } catch (e) { console.error(e); }
  };

  const filtered = products.filter(p => {
    const term = search.toLowerCase();
    const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.partNumber?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term);
    const matchesCat = !filterCat || p.category_id.toString() === filterCat;
    const matchesStock = !filterStock || (filterStock === 'low' && p.stock_quantity <= p.low_stock_threshold) || (filterStock === 'out' && p.stock_quantity === 0) || (filterStock === 'in' && p.stock_quantity > 0);
    return matchesSearch && matchesCat && matchesStock;
  });

  const InputField = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>{children}</div>
  );
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">{products.length} total products</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search products, SKU, barcode..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20">
          <option value="">All Stock</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Product</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">SKU / Barcode</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Category</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Price</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Stock</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 w-24">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => {
                  const cat = categories.find(c => c.id === p.category_id);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                            {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={16} className="m-auto text-gray-400 mt-2.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{p.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{p.partNumber || '—'}</p>
                          </div>
                          {p.is_on_sale && <span className="ml-1 px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded">SALE</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs font-mono text-gray-600">{p.sku || '—'}</p>
                        <p className="text-[10px] font-mono text-gray-400">{p.barcode || '—'}</p>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-gray-600">{cat?.name || '—'}</span></td>
                      <td className="px-4 py-3 text-right">
                        {p.is_on_sale ? (
                          <div><span className="text-xs text-gray-400 line-through">₱{p.price}</span><br /><span className="text-red-600 font-medium">₱{p.sale_price}</span></div>
                        ) : <span className="font-medium text-gray-900">₱{p.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-sm ${p.stock_quantity === 0 ? 'text-red-600' : p.stock_quantity <= p.low_stock_threshold ? 'text-amber-600' : 'text-gray-900'}`}>
                          {p.stock_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.stock_quantity === 0 ? 'bg-red-50 text-red-600' : p.stock_quantity <= p.low_stock_threshold ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                          {p.stock_quantity === 0 ? 'Out of Stock' : p.stock_quantity <= p.low_stock_threshold ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="Edit"><Pencil size={14} /></button>
                          <button onClick={() => handleDuplicate(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-purple-600 transition-colors" title="Duplicate"><Copy size={14} /></button>
                          <button onClick={() => handleDelete(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Product' : 'Add Product'} size="2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Product Name" required>
              <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required className={inputClass} placeholder="Front Brake Pad Set" />
            </InputField>
            <InputField label="Part Number">
              <input value={form.partNumber} onChange={e => setForm(f => ({...f, partNumber: e.target.value}))} className={inputClass} placeholder="PN-001234" />
            </InputField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InputField label="Category" required>
              <select value={form.category_id} onChange={e => setForm(f => ({...f, category_id: e.target.value}))} required className={inputClass}>
                <option value="">Select</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </InputField>
            <InputField label="Brand">
              <input value={form.brand} onChange={e => setForm(f => ({...f, brand: e.target.value}))} className={inputClass} placeholder="Honda" />
            </InputField>
            <InputField label="Box / Location">
              <input value={form.boxNumber} onChange={e => setForm(f => ({...f, boxNumber: e.target.value}))} className={inputClass} placeholder="A-12" />
            </InputField>
          </div>

          <InputField label="Description">
            <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={3} className={inputClass} placeholder="Product description..." />
          </InputField>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InputField label="Selling Price" required>
              <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} required className={inputClass} />
            </InputField>
            <InputField label="Buying Price" required>
              <input type="number" step="0.01" value={form.buyingPrice} onChange={e => setForm(f => ({...f, buyingPrice: e.target.value}))} required className={inputClass} />
            </InputField>
            <InputField label="Stock Quantity" required>
              <input type="number" value={form.stock_quantity} onChange={e => setForm(f => ({...f, stock_quantity: e.target.value}))} required className={inputClass} />
            </InputField>
            <InputField label="Low Stock Alert">
              <input type="number" value={form.low_stock_threshold} onChange={e => setForm(f => ({...f, low_stock_threshold: e.target.value}))} className={inputClass} />
            </InputField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="SKU"><input value={form.sku} onChange={e => setForm(f => ({...f, sku: e.target.value}))} className={inputClass} placeholder="Auto-generated if empty" /></InputField>
            <InputField label="Barcode"><input value={form.barcode} onChange={e => setForm(f => ({...f, barcode: e.target.value}))} className={inputClass} placeholder="Auto-generated if empty" /></InputField>
          </div>

          <InputField label="Image URL">
            <input value={form.image} onChange={e => setForm(f => ({...f, image: e.target.value}))} className={inputClass} placeholder="https://..." />
          </InputField>

          {/* Sale */}
          <div className={`p-4 rounded-lg border ${form.is_on_sale ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
            <label className="flex items-center gap-2 font-medium text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_on_sale} onChange={e => setForm(f => ({...f, is_on_sale: e.target.checked}))} className="w-4 h-4 text-red-600 rounded focus:ring-red-500" />
              Put on Sale
            </label>
            {form.is_on_sale && (
              <div className="mt-3">
                <InputField label="Sale Price">
                  <input type="number" step="0.01" value={form.sale_price} onChange={e => setForm(f => ({...f, sale_price: e.target.value}))} className={inputClass} />
                </InputField>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
              {editing ? 'Update Product' : 'Add Product'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ProductsView;
