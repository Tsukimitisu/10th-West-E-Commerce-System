import React, { useEffect, useState } from 'react';
import { getProducts, getCategories, getSubcategories, createProduct, updateProduct, deleteProduct, uploadProductImage, addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory } from '../../services/api';
import { Plus, Pencil, Trash2, Search, Package, Eye, EyeOff, Copy, Download, Upload, Filter, MoreVertical, Image as ImageIcon, AlertTriangle, Layers } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import VariantsModal from '../../components/owner/VariantsModal';
import { useSocketEvent } from '../../context/SocketContext';

const InputField = ({ label, required, children }) => (
  <div><label className="block text-xs font-medium text-gray-300 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>{children}</div>
);

const inputClass = "w-full px-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400";

const ProductsView = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [variantsModalOpen, setVariantsModalOpen] = useState(false);
  const [selectedProductVariants, setSelectedProductVariants] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [editingSubcategoryId, setEditingSubcategoryId] = useState(null);
  const [editingSubcategoryName, setEditingSubcategoryName] = useState('');
  const [form, setForm] = useState({
    partNumber: '', name: '', description: '', price: '', buyingPrice: '',
    category_id: '', subcategory_id: '', image: '', stock_quantity: '0', boxNumber: '',
    low_stock_threshold: '5', sale_price: '', is_on_sale: false, sku: '', barcode: '',
    brand: ''
  });

  const fetch = async () => {
    try {
      const [p, c, s] = await Promise.all([getProducts(), getCategories(), getSubcategories()]);
      setProducts(p); setCategories(c); setSubcategories(s || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  // Real-time: refresh on product/inventory changes
  useSocketEvent('product:created', fetch);
  useSocketEvent('product:updated', fetch);
  useSocketEvent('product:deleted', fetch);
  useSocketEvent('inventory:updated', fetch);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const openAdd = () => {
    setEditing(null);
    setSelectedImageFile(null);
    setImagePreviewUrl('');
    setFormError('');
    setForm(prev => ({
      ...prev,
      partNumber: '',
      name: '',
      description: '',
      price: '',
      buyingPrice: '',
      category_id: categories[0]?.id?.toString() || '',
      subcategory_id: '',
      image: '',
      stock_quantity: '0',
      boxNumber: '',
      low_stock_threshold: '5',
      sale_price: '',
      is_on_sale: false,
      sku: '',
      barcode: '',
      brand: ''
    }));
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setSelectedImageFile(null);
    setImagePreviewUrl('');
    setFormError('');
    setForm({
      partNumber: p.partNumber || '', name: p.name, description: p.description || '', price: p.price.toString(),
      buyingPrice: p.buyingPrice.toString(), category_id: p.category_id.toString(), subcategory_id: p.subcategory_id?.toString() || '', image: p.image || '',
      stock_quantity: p.stock_quantity.toString(), boxNumber: p.boxNumber || '',
      low_stock_threshold: p.low_stock_threshold.toString(), sale_price: p.sale_price?.toString() || '',
      is_on_sale: p.is_on_sale || false, sku: p.sku || '', barcode: p.barcode || '', brand: p.brand || ''
    });
    setModalOpen(true);
  };

  const handleDuplicate = (p) => {
    setEditing(null);
    setSelectedImageFile(null);
    setImagePreviewUrl('');
    setFormError('');
    setForm({
      partNumber: '', name: `${p.name} (Copy)`, description: p.description || '', price: p.price.toString(),
      buyingPrice: p.buyingPrice.toString(), category_id: p.category_id.toString(), subcategory_id: p.subcategory_id?.toString() || '', image: p.image || '',
      stock_quantity: '0', boxNumber: p.boxNumber || '', low_stock_threshold: p.low_stock_threshold.toString(),
      sale_price: p.sale_price?.toString() || '', is_on_sale: false, sku: '', barcode: '', brand: p.brand || ''
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setFormError('');

      let finalImage = form.image || '';
      if (selectedImageFile) {
        finalImage = await uploadProductImage(selectedImageFile);
      }

      const payload = {
        partNumber: form.partNumber,
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        buyingPrice: parseFloat(form.buyingPrice),
        category_id: parseInt(form.category_id, 10),
        subcategory_id: form.subcategory_id ? parseInt(form.subcategory_id, 10) : null,
        image: finalImage,
        stock_quantity: parseInt(form.stock_quantity, 10),
        boxNumber: form.boxNumber,
        low_stock_threshold: form.low_stock_threshold === '' ? undefined : parseInt(form.low_stock_threshold, 10),
        sale_price: form.sale_price ? parseFloat(form.sale_price) : undefined,
        is_on_sale: form.is_on_sale,
        sku: form.sku,
        barcode: form.partNumber || form.barcode,
        brand: form.brand
      };

      if (editing) await updateProduct(editing.id, payload);
      else await createProduct(payload);
      fetch();
      setTimeout(() => setModalOpen(false), 100);
    } catch (e) {
      setFormError(e.message || 'Failed to save product');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setSelectedImageFile(file);
    setImagePreviewUrl(preview);
  };

  const clearSelectedImage = () => {
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImageFile(null);
    setImagePreviewUrl('');
  };

  const handleDelete = (p) => {
    setDeleteTarget(p);
  };

  const openCategoryModal = () => {
    setCategoryError('');
    setNewCategoryName('');
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setCategoryModalOpen(true);
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) {
      setCategoryError('Category name is required');
      return;
    }

    try {
      setCategorySubmitting(true);
      setCategoryError('');
      const created = await addCategory(name);
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(prev => ({ ...prev, category_id: created.id.toString() }));
      setNewCategoryName('');
    } catch (e) {
      setCategoryError(e.message || 'Failed to create category');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const startEditCategory = (category) => {
    setCategoryError('');
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setCategoryError('');
  };

  const handleUpdateCategory = async (categoryId) => {
    const name = editingCategoryName.trim();
    if (!name) {
      setCategoryError('Category name is required');
      return;
    }

    try {
      setCategorySubmitting(true);
      setCategoryError('');
      const updated = await updateCategory(categoryId, name);
      setCategories(prev => prev.map(c => (c.id === categoryId ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingCategoryId(null);
      setEditingCategoryName('');
    } catch (e) {
      setCategoryError(e.message || 'Failed to update category');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    try {
      setCategorySubmitting(true);
      setCategoryError('');
      await deleteCategory(category.id);
      setCategories(prev => prev.filter(c => c.id !== category.id));
      setForm(prev => ({ ...prev, category_id: prev.category_id === category.id.toString() ? '' : prev.category_id }));
      setFilterCat(prev => (prev === category.id.toString() ? '' : prev));
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        setEditingCategoryName('');
      }
    } catch (e) {
      setCategoryError(e.message || 'Failed to delete category. It may still be used by products.');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleCreateSubcategory = async (e) => {
    e.preventDefault();
    const name = newSubcategoryName.trim();
    if (!name || !form.category_id) return;
    try {
      setCategorySubmitting(true); setCategoryError('');
      const created = await addSubcategory({ name, category_id: parseInt(form.category_id, 10) });
      setSubcategories(prev => [...prev, created].sort((a,b) => a.name.localeCompare(b.name)));
      setForm(prev => ({ ...prev, subcategory_id: created.id.toString() }));
      setNewSubcategoryName('');
    } catch (e) { setCategoryError(e.message || 'Failed to create subcategory'); }
    finally { setCategorySubmitting(false); }
  };

  const handleUpdateSubcategory = async (id) => {
    const name = editingSubcategoryName.trim();
    if (!name) return;
    try {
      setCategorySubmitting(true); setCategoryError('');
      const updated = await updateSubcategory(id, name);
      setSubcategories(prev => prev.map(s => s.id === id ? updated : s).sort((a,b) => a.name.localeCompare(b.name)));
      setEditingSubcategoryId(null); setEditingSubcategoryName('');
    } catch (e) { setCategoryError(e.message || 'Failed to update subcategory'); }
    finally { setCategorySubmitting(false); }
  };

  const handleDeleteSubcategory = async (subcat) => {
    if (!window.confirm(`Delete subcategory "${subcat.name}"?`)) return;
    try {
      setCategorySubmitting(true); setCategoryError('');
      await deleteSubcategory(subcat.id);
      setSubcategories(prev => prev.filter(s => s.id !== subcat.id));
      setForm(prev => ({ ...prev, subcategory_id: prev.subcategory_id === subcat.id.toString() ? '' : prev.subcategory_id }));
    } catch (e) { setCategoryError(e.message || 'Failed to delete subcategory'); }
    finally { setCategorySubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteProduct(deleteTarget.id); fetch(); } catch (e) { console.error(e); }
    setDeleteTarget(null);
  };

  const filtered = products.filter(p => {
    const term = search.toLowerCase();
    const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.partNumber?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term);
    const matchesCat = !filterCat || p.category_id.toString() === filterCat;
    const matchesStock = !filterStock || (filterStock === 'low' && p.stock_quantity <= p.low_stock_threshold) || (filterStock === 'out' && p.stock_quantity === 0) || (filterStock === 'in' && p.stock_quantity > 0);
    return matchesSearch && matchesCat && matchesStock;
  });



  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-white">Products</h1>
          <p className="text-sm text-gray-400">{products.length} total products</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search products, SKU, barcode..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className="px-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20">
          <option value="">All Stock</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-white/10 border-t-red-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#202430]/80 border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Product</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300 hidden md:table-cell">SKU / Barcode</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Category</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300">Price</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300">Stock</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300 w-24">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map(p => {
                  const cat = categories.find(c => c.id === p.category_id);
                  const subcat = subcategories.find(s => s.id === p.subcategory_id);
                  return (
                    <tr key={p.id} className="hover:bg-[#202430]/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#202430] rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                            {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={16} className="m-auto text-gray-400 mt-2.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white text-sm truncate max-w-[200px]">{p.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{p.partNumber || 'â€”'}</p>
                          </div>
                          {p.is_on_sale && <span className="ml-1 px-1.5 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-bold rounded">SALE</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs font-mono text-gray-500">{p.sku || 'â€”'}</p>
                        <p className="text-[10px] font-mono text-gray-400">{p.barcode || 'â€”'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-300 block">{cat?.name || '—'}</span>
                        {subcat && <span className="text-[10px] text-gray-400 block">{subcat.name}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.is_on_sale ? (
                          <div><span className="text-xs text-gray-400 line-through">₱{p.price}</span><br /><span className="text-red-500 font-medium">₱{p.sale_price}</span></div>
                        ) : <span className="font-medium text-white">₱{p.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-sm ${p.stock_quantity === 0 ? 'text-red-400' : p.stock_quantity <= p.low_stock_threshold ? 'text-amber-400' : 'text-white'}`}>
                          {p.stock_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.stock_quantity === 0 ? 'bg-red-500/20 text-red-400' : p.stock_quantity <= p.low_stock_threshold ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
                          {p.stock_quantity === 0 ? 'Out of Stock' : p.stock_quantity <= p.low_stock_threshold ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedProductVariants(p); setVariantsModalOpen(true); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-green-400 transition-colors" title="Manage Variants"><Layers size={14} /></button>
                          <button onClick={() => openEdit(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-blue-400 transition-colors" title="Edit"><Pencil size={14} /></button>
                          <button onClick={() => handleDuplicate(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-purple-400 transition-colors" title="Duplicate"><Copy size={14} /></button>
                          <button onClick={() => handleDelete(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={14} /></button>
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
      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Product' : 'Add Product'} size="2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="Product Name" required>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={inputClass} placeholder="Front Brake Pad Set" />
              </InputField>
              <InputField label="Part Number">
                <input value={form.partNumber} onChange={e => setForm(f => ({ ...f, partNumber: e.target.value, barcode: e.target.value }))} className={inputClass} placeholder="PN-001234" />
              </InputField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <InputField label="Category" required>
                <div className="space-y-2">
                  <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))} required className={inputClass}>
                    <option value="">Select</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={openCategoryModal}
                    className="text-xs font-medium text-red-400 hover:text-red-300"
                  >
                    + Manage Categories
                  </button>
                </div>
              </InputField>
              <InputField label="Subcategory">
                <div className="space-y-2">
                  <select value={form.subcategory_id} onChange={e => setForm(f => ({ ...f, subcategory_id: e.target.value }))} className={inputClass} disabled={!form.category_id}>
                    <option value="">None</option>
                    {subcategories.filter(s => s.category_id?.toString() === form.category_id?.toString()).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSubcategoryModalOpen(true)}
                    className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                    disabled={!form.category_id}
                  >
                    + Manage Subcategories
                  </button>
                </div>
              </InputField>
              <InputField label="Brand">
                <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} className={inputClass} placeholder="Honda" />
              </InputField>
              <InputField label="Box / Location">
                <input value={form.boxNumber} onChange={e => setForm(f => ({ ...f, boxNumber: e.target.value }))} className={inputClass} placeholder="A-12" />
              </InputField>
            </div>

            <InputField label="Description">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputClass} placeholder="Product description..." />
            </InputField>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InputField label="Selling Price" required>
                <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required className={inputClass} />
              </InputField>
              <InputField label="Buying Price" required>
                <input type="number" step="0.01" value={form.buyingPrice} onChange={e => setForm(f => ({ ...f, buyingPrice: e.target.value }))} required className={inputClass} />
              </InputField>
              <InputField label="Stock Quantity" required>
                <input type="number" value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} required className={inputClass} />
              </InputField>
              <InputField label="Low Stock Alert">
                <input type="number" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))} className={inputClass} />
              </InputField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="SKU"><input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className={inputClass} placeholder="Auto-generated if empty" /></InputField>
            </div>

            <InputField label="Product Image">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageFileChange} className={inputClass} />
              <p className="text-[11px] text-gray-400 mt-1">PNG, JPG, WEBP, GIF (max 5MB)</p>
              {(imagePreviewUrl || form.image) && (
                <div className="mt-2 flex items-start gap-3">
                  <img src={imagePreviewUrl || form.image} alt="Preview" className="w-20 h-20 rounded-lg object-cover border border-gray-700" />
                  {selectedImageFile && (
                    <button type="button" onClick={clearSelectedImage} className="px-3 py-1.5 text-xs text-gray-300 hover:bg-[#202430] rounded-lg">
                      Remove Selected
                    </button>
                  )}
                </div>
              )}
            </InputField>

            {/* Sale */}
            <div className={`p-4 rounded-lg border ${form.is_on_sale ? 'bg-red-500/10 border-red-500/30' : 'bg-[#202430]/40 border-white/10'}`}>
              <label className="flex items-center gap-2 font-medium text-sm text-gray-200 cursor-pointer">
                <input type="checkbox" checked={form.is_on_sale} onChange={e => setForm(f => ({ ...f, is_on_sale: e.target.checked }))} className="w-4 h-4 text-red-500 rounded focus:ring-red-500" />
                Put on Sale
              </label>
              {form.is_on_sale && (
                <div className="mt-3">
                  <InputField label="Sale Price">
                    <input type="number" step="0.01" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} className={inputClass} />
                  </InputField>
                </div>
              )}
            </div>

            {formError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
              <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2 text-sm text-gray-300 hover:bg-[#202430] rounded-lg transition-colors">Cancel</button>
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-red-500/100 hover:bg-red-600 disabled:opacity-70 text-white text-sm font-medium rounded-lg transition-colors">
                {submitting ? 'Saving...' : editing ? 'Update Product' : 'Add Product'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Category Management Modal */}
      {categoryModalOpen && (
        <Modal
          isOpen={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          title="Manage Categories"
          size="lg"
        >
          <div className="space-y-4">
            <form onSubmit={handleCreateCategory} className="space-y-2">
              <InputField label="Add New Category" required>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. MIO I 125"
                  />
                  <button
                    type="submit"
                    disabled={categorySubmitting}
                    className="px-4 py-2 bg-red-500/100 hover:bg-red-600 disabled:opacity-70 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    {categorySubmitting ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </InputField>
            </form>

            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-[#202430]/40 border-b border-white/10 text-xs font-semibold text-gray-300">Existing Categories</div>
              <div className="max-h-64 overflow-y-auto divide-y divide-white/10">
                {categories.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">No categories yet.</p>
                ) : (
                  categories.map(category => (
                    <div key={category.id} className="px-3 py-2 flex items-center gap-2">
                      {editingCategoryId === category.id ? (
                        <>
                          <input
                            value={editingCategoryName}
                            onChange={e => setEditingCategoryName(e.target.value)}
                            className={`${inputClass} py-1.5`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateCategory(category.id)}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-red-500/100 hover:bg-red-600 text-white rounded-md disabled:opacity-70"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditCategory}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-[#202430] hover:bg-[#2a3244] text-gray-200 rounded-md disabled:opacity-70"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-gray-200">{category.name}</span>
                          <button
                            type="button"
                            onClick={() => startEditCategory(category)}
                            disabled={categorySubmitting}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#202430] text-gray-400 hover:text-blue-400 disabled:opacity-70"
                            title="Edit category"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(category)}
                            disabled={categorySubmitting}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#202430] text-gray-400 hover:text-red-400 disabled:opacity-70"
                            title="Delete category"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {categoryError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {categoryError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-[#202430] rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Subcategory Management Modal */}
      {subcategoryModalOpen && (
        <Modal isOpen={subcategoryModalOpen} onClose={() => setSubcategoryModalOpen(false)} title={`Manage Subcategories (${categories.find(c => c.id.toString() === form.category_id?.toString())?.name || 'Selected Category'})`} size="md">
          <div className="space-y-4">
            <form onSubmit={handleCreateSubcategory} className="flex gap-2">
              <input
                type="text"
                value={newSubcategoryName}
                onChange={(e) => setNewSubcategoryName(e.target.value)}
                placeholder="New subcategory name"
                className="flex-1 px-3 py-2 border border-white/10 bg-[#202430] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
                disabled={categorySubmitting}
              />
              <button
                type="submit"
                disabled={!newSubcategoryName.trim() || categorySubmitting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus size={16} /> Add
              </button>
            </form>

            <div className="border border-gray-700 rounded-lg max-h-60 overflow-y-auto">
              <div className="divide-y divide-gray-800">
                {subcategories.filter(s => s.category_id?.toString() === form.category_id?.toString()).length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">No subcategories yet.</div>
                ) : (
                  subcategories.filter(s => s.category_id?.toString() === form.category_id?.toString()).map(subcat => (
                    <div key={subcat.id} className="flex items-center justify-between p-3 bg-gray-900 group">
                      {editingSubcategoryId === subcat.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingSubcategoryName}
                            onChange={(e) => setEditingSubcategoryName(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-red-500"
                            autoFocus
                            disabled={categorySubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateSubcategory(subcat.id)}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-md disabled:opacity-70"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSubcategoryId(null)}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white rounded-md disabled:opacity-70 border border-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium text-sm text-gray-300">{subcat.name}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => { setEditingSubcategoryId(subcat.id); setEditingSubcategoryName(subcat.name); setCategoryError(''); }}
                              disabled={categorySubmitting}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-400 hover:text-blue-500 disabled:opacity-70"
                              title="Edit subcategory"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubcategory(subcat)}
                              disabled={categorySubmitting}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-400 hover:text-red-500 disabled:opacity-70"
                              title="Delete subcategory"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {categoryError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {categoryError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSubcategoryModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-[#202430] rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      <VariantsModal isOpen={variantsModalOpen} onClose={() => { setVariantsModalOpen(false); setSelectedProductVariants(null); }} product={selectedProductVariants} />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center"><AlertTriangle size={20} className="text-red-400" /></div>
              <h3 className="text-lg font-bold text-white">Delete Product</h3>
            </div>
            <p className="text-sm text-gray-300 mb-4">Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-[#202430] hover:bg-[#2a3244] text-gray-200 text-sm font-medium rounded-xl">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsView;


