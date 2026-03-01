import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit3, Check, X, Home, Building2, Star, AlertTriangle } from 'lucide-react';
import { getAddresses, saveAddress, deleteAddress, updateAddress } from '../../services/api';
import AccountLayout from '../../components/customer/AccountLayout';

const AddressBook = () => {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ label: 'Home', name: '', phone: '', street: '', city: '', state: '', zip: '', country: 'Philippines', is_default: false });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const resetForm = () => { setForm({ label: 'Home', name: '', phone: '', street: '', city: '', state: '', zip: '', country: 'Philippines', is_default: false }); setEditing(null); setShowForm(false); };

  useEffect(() => {
    const load = async () => {
      try {
        const userData = localStorage.getItem('shopCoreUser');
        const user = userData ? JSON.parse(userData) : null;
        if (!user) { setLoading(false); return; }
        const data = await getAddresses(user.id); setAddresses(data);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        const updated = await updateAddress(editing.id, form);
        setAddresses(addresses.map(a => a.id === editing.id ? updated : a));
      } else {
        const created = await saveAddress(form);
        setAddresses([...addresses, created]);
      }
      resetForm();
    } catch {}
  };

  const handleDelete = (addr) => {
    setDeleteTarget(addr);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteAddress(deleteTarget.id); setAddresses(addresses.filter(a => a.id !== deleteTarget.id)); } catch {}
    setDeleteTarget(null);
  };

  const startEdit = (addr) => {
    setForm({ label: addr.label || 'Home', name: addr.name || '', phone: addr.phone || '', street: addr.street || '', city: addr.city || '', state: addr.state || '', zip: addr.zip || '', country: addr.country || 'Philippines', is_default: addr.is_default || false });
    setEditing(addr);
    setShowForm(true);
  };

  return (
    <AccountLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg text-gray-900 flex items-center gap-2"><MapPin size={20} /> Address Book</h2>
          {!showForm && (
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
              <Plus size={16} /> Add Address
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">{editing ? 'Edit Address' : 'New Address'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Label selector */}
              <div className="flex gap-2">
                {['Home', 'Office', 'Other'].map(l => (
                  <button key={l} type="button" onClick={() => setForm(f => ({...f, label: l}))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${form.label === l ? 'bg-orange-50 border-orange-200 text-orange-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {l === 'Home' ? <Home size={14} /> : l === 'Office' ? <Building2 size={14} /> : <MapPin size={14} />} {l}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <input type="text" value={form.street} onChange={e => setForm(f => ({...f, street: e.target.value}))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                  <input type="text" value={form.state} onChange={e => setForm(f => ({...f, state: e.target.value}))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                  <input type="text" value={form.zip} onChange={e => setForm(f => ({...f, zip: e.target.value}))} required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input type="text" value={form.country} onChange={e => setForm(f => ({...f, country: e.target.value}))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({...f, is_default: e.target.checked}))}
                  className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                Set as default address
              </label>
              <div className="flex gap-2">
                <button type="submit" className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">
                  {editing ? 'Update Address' : 'Save Address'}
                </button>
                <button type="button" onClick={resetForm} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Address cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2].map(i => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : addresses.length === 0 && !showForm ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <MapPin size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">No saved addresses</h3>
            <p className="text-sm text-gray-500">Add an address to speed up your checkout.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map(addr => (
              <div key={addr.id} className={`bg-white rounded-xl border p-4 relative ${addr.is_default ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100'}`}>
                {addr.is_default && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-500 text-xs font-medium rounded-full">
                    <Star size={10} className="fill-current" /> Default
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  {addr.label === 'Home' ? <Home size={14} className="text-gray-400" /> : addr.label === 'Office' ? <Building2 size={14} className="text-gray-400" /> : <MapPin size={14} className="text-gray-400" />}
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{addr.label || 'Address'}</span>
                </div>
                <p className="font-medium text-gray-900 text-sm">{addr.name}</p>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                  {addr.street}<br />
                  {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.zip}<br />
                  {addr.phone}
                </p>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => startEdit(addr)} className="text-sm text-gray-500 hover:text-orange-500 flex items-center gap-1 transition-colors"><Edit3 size={13} /> Edit</button>
                  <button onClick={() => handleDelete(addr)} className="text-sm text-gray-500 hover:text-orange-500 flex items-center gap-1 transition-colors"><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
                <h3 className="text-lg font-bold text-gray-900">Delete Address</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this address?</p>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-4">
                <p className="text-sm font-semibold text-gray-900">{deleteTarget.name}</p>
                <p className="text-xs text-gray-400">{deleteTarget.street}, {deleteTarget.city}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl">Cancel</button>
                <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AccountLayout>
  );
};

export default AddressBook;
