import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, Trash2, Edit3, Check, X, Home, Building2, Star, AlertTriangle } from 'lucide-react';
import { getAddresses, saveAddress, deleteAddress, updateAddress } from '../../services/api';
import AccountLayout from '../../components/customer/AccountLayout';
import AddressDropdowns from '../../components/AddressDropdowns';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import MapPinPicker from '../../components/MapPinPicker';

const AddressBook = () => {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ label: 'Home', name: '', phone: '', street: '', barangay: '', city: '', state: '', zip: '', country: 'Philippines', is_default: false, lat: null, lng: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [zipError, setZipError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const phoneInputRef = useRef(null);

  const resetForm = () => { setForm({ label: 'Home', name: '', phone: '', street: '', barangay: '', city: '', state: '', zip: '', country: 'Philippines', is_default: false, lat: null, lng: null }); setEditing(null); setShowForm(false); setSaveError(''); setZipError(''); setPhoneError(''); };
  const digitsOnly = (value) => value.replace(/\D/g, '');
  const formatPhone = (value) => value.replace(/[^\d+]/g, '');
  const validatePhone = (phone) => /^(09\d{9}|\+639\d{9})$/.test(phone);
  const validateZip = (zip) => /^\d{4}$/.test(zip);
  const normalizeText = (value) => String(value || '').trim();

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
    setSaveError('');
    setPhoneError('');
    setZipError('');

    const trimmedForm = {
      ...form,
      name: normalizeText(form.name),
      phone: normalizeText(form.phone),
      street: normalizeText(form.street),
      barangay: normalizeText(form.barangay),
      city: normalizeText(form.city),
      state: normalizeText(form.state),
      zip: digitsOnly(form.zip),
    };

    if (!trimmedForm.name || !trimmedForm.street || !trimmedForm.city || !trimmedForm.state || !trimmedForm.zip || !trimmedForm.phone) {
      setSaveError('Please fill in all required fields (Name, Phone, Street, City, Province, Zip).');
      return;
    }
    if (trimmedForm.country && trimmedForm.country !== 'Philippines') {
      setSaveError('Only Philippine addresses are allowed.');
      return;
    }
    
    if (!validatePhone(trimmedForm.phone)) {
      setPhoneError('Invalid phone number. Must start with 09 or +639 and have correct length.');
      if (phoneInputRef.current) {
        phoneInputRef.current.focus();
        phoneInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const zipValid = validateZip(trimmedForm.zip);
    if (!zipValid) {
      setZipError('Zip Code must contain exactly 4 digits.');
      return;
    }
    try {
      const payload = { ...trimmedForm };
      // Persist geolocation locally as a fallback for legacy rows without coordinates.
      if (trimmedForm.lat && trimmedForm.lng) {
        const key = `${trimmedForm.street}|${trimmedForm.city}|${trimmedForm.state}`;
        const stored = JSON.parse(localStorage.getItem('addressGeo') || '{}');
        stored[key] = { lat: trimmedForm.lat, lng: trimmedForm.lng };
        localStorage.setItem('addressGeo', JSON.stringify(stored));
      }
      if (editing) {
        const updated = await updateAddress(editing.id, payload);
        setAddresses(prev => prev.map(a => a.id === editing.id ? updated : a));
      } else {
        const created = await saveAddress(payload);
        setAddresses(prev => [created, ...prev]);
      }
      resetForm();
    } catch (err) {
      setSaveError(err?.message || 'Failed to save address');
    }
  };

  const handleDelete = (addr) => {
    setDeleteTarget(addr);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { 
      await deleteAddress(deleteTarget.id); 
      setAddresses(addresses.filter(a => a.id !== deleteTarget.id)); 
      if (editing && editing.id === deleteTarget.id) {
        resetForm();
      }
    } catch {}
    setDeleteTarget(null);
  };

  const startEdit = (addr) => {
    setForm({
      label: addr.label || 'Home',
      name: addr.name || addr.recipient_name || '',
      phone: addr.phone || '',
      street: addr.street || '',
      barangay: addr.barangay || '',
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.zip || addr.postal_code || '',
      country: 'Philippines',
      is_default: addr.is_default || false,
      lat: addr.lat || null,
      lng: addr.lng || null,
    });
    try {
      const stored = JSON.parse(localStorage.getItem('addressGeo') || '{}');
      const key = `${addr.street}|${addr.city}|${addr.state}`;
      if (stored[key]) {
        setForm(f => ({ ...f, lat: stored[key].lat, lng: stored[key].lng }));
      }
    } catch {}
    setEditing(addr);
    setShowForm(true);
    setPhoneError('');
    const existingZip = addr.zip || addr.postal_code || '';
    setZipError(existingZip.length === 0 || validateZip(existingZip) ? '' : 'Zip Code must contain exactly 4 digits.');
  };

  return (
    <AccountLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg text-white flex items-center gap-2"><MapPin size={20} /> Address Book</h2>
          {!showForm && (
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
              <Plus size={16} /> Add Address
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <h3 className="font-semibold text-white mb-4">{editing ? 'Edit Address' : 'New Address'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Label selector */}
              <div className="flex gap-2">
                {['Home', 'Office', 'Other'].map(l => (
                  <button key={l} type="button" onClick={() => setForm(f => ({...f, label: l}))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${form.label === l ? 'bg-red-500/10 border-red-200 text-red-400' : 'border-gray-700 text-gray-200 hover:bg-gray-900'}`}>
                    {l === 'Home' ? <Home size={14} /> : l === 'Office' ? <Building2 size={14} /> : <MapPin size={14} />} {l}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">Full Name</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required
                    className="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-sm bg-gray-900 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">Phone</label>
                  <input type="tel" value={form.phone} ref={phoneInputRef} onChange={e => setForm(f => ({...f, phone: formatPhone(e.target.value)}))} required
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${phoneError ? 'border-red-300 ring-1 ring-red-300 bg-red-50/5' : 'border-gray-700'}`} />
                  {phoneError && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> {phoneError}</p>}
                </div>
              </div>
              <div className="space-y-4">
                <AddressDropdowns
                  province={form.state}
                  city={form.city}
                  barangay={form.barangay}
                  onChange={({ province, city, barangay }) => {
                    setForm(f => ({
                      ...f,
                      state: province || '',
                      city: city || '',
                      barangay: barangay || '',
                      lat: null,
                      lng: null,
                    }));
                  }}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">Street / House No.</label>
                  <AddressAutocomplete
                    value={form.street}
                    onInputChange={(val) => setForm(f => ({ ...f, street: val, lat: null, lng: null }))}
                    onSelect={(selected) => {
                      setForm(f => ({
                        ...f,
                        street: selected.street || f.street,
                        barangay: selected.barangay || f.barangay,
                        city: selected.city || f.city,
                        state: selected.state || f.state,
                        zip: selected.postal_code || f.zip,
                        lat: selected.lat ?? null,
                        lng: selected.lng ?? null,
                      }));
                    }}
                    context={{
                      barangay: form.barangay,
                      city: form.city,
                      state: form.state,
                    }}
                    strictContext={Boolean(form.barangay || form.city || form.state)}
                    placeholder="House No. / Street"
                  />
                </div>
                <MapPinPicker
                  street={form.street}
                  barangay={form.barangay}
                  city={form.city}
                  state={form.state}
                  lat={form.lat}
                  lng={form.lng}
                  onChange={({ lat, lng }) => setForm(f => ({ ...f, lat, lng }))}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">ZIP Code</label>
                  <input
                    type="text"
                    value={form.zip}
                    onChange={e => {
                      const val = digitsOnly(e.target.value);
                      setForm(f => ({...f, zip: val }));
                      setZipError(val.length === 0 || validateZip(val) ? '' : 'Zip Code must contain exactly 4 digits.');
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${zipError ? 'border-red-300 focus:ring-red-400' : 'border-gray-700'}`}
                  />
                  {zipError && <p className="text-xs text-red-500 mt-1">{zipError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">Country</label>
                  <div className="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-sm bg-gray-900 text-gray-200">
                    Philippines
                  </div>
                </div>
              </div>
              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({...f, is_default: e.target.checked}))}
                  className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-orange-500" />
                Set as default address
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={!!zipError || !validateZip(form.zip)} className="px-5 py-2.5 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                  {editing ? 'Update Address' : 'Save Address'}
                </button>
                <button type="button" onClick={resetForm} className="px-5 py-2.5 border border-gray-700 text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors">Cancel</button>
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
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
            <MapPin size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-white mb-1">No saved addresses</h3>
            <p className="text-sm text-gray-400">Add an address to speed up your checkout.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map(addr => (
              <div key={addr.id} className={`bg-gray-800 rounded-xl border p-4 relative ${addr.is_default ? 'border-red-200 ring-1 ring-orange-100' : 'border-gray-700'}`}>
                {addr.is_default && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-500 text-xs font-medium rounded-full">
                    <Star size={10} className="fill-current" /> Default
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  {addr.label === 'Home' ? <Home size={14} className="text-gray-400" /> : addr.label === 'Office' ? <Building2 size={14} className="text-gray-400" /> : <MapPin size={14} className="text-gray-400" />}
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{addr.label || 'Address'}</span>
                </div>
                <p className="font-medium text-white text-sm">{addr.name || addr.recipient_name}</p>
                <p className="text-sm text-gray-200 mt-1 leading-relaxed">
                  {addr.street}{addr.barangay ? `, ${addr.barangay}` : ''}<br />
                  {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.zip || addr.postal_code}<br />
                  {addr.phone}
                </p>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                  <button onClick={() => startEdit(addr)} className="text-sm text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"><Edit3 size={13} /> Edit</button>
                  <button onClick={() => handleDelete(addr)} className="text-sm text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
                <h3 className="text-lg font-bold text-white">Delete Address</h3>
              </div>
              <p className="text-sm text-gray-200 mb-4">Are you sure you want to delete this address?</p>
              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 mb-4">
                <p className="text-sm font-semibold text-white">{deleteTarget.name}</p>
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


