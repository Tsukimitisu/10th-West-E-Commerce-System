import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Package, Pencil, Plus, Search, Trash2, Video } from 'lucide-react';
import PageHeader from '../../components/operations/PageHeader';
import Modal from '../../components/owner/Modal';
import {
  createEcommerceListing,
  getEcommerceListings,
  getInventory,
  updateEcommerceListing,
  uploadProductImage,
  uploadProductVideo,
} from '../../services/api';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import InventoryPickerModal from '../../components/owner/InventoryPickerModal';

const createForm = (listing) => ({
  inventory_item_id: listing?.inventory_item_id || '',
  ecommerce_description: listing?.ecommerce_description || '',
  visibility_status: listing?.visibility_status || 'draft',
  is_featured: listing?.is_featured === true,
  is_best_seller: listing?.is_best_seller === true,
  is_new_arrival: listing?.is_new_arrival === true,
  media: Array.isArray(listing?.media) ? listing.media.map((item) => ({ ...item })) : [],
});

const StorefrontListingsView = () => {
  const [inventory, setInventory] = useState([]);
  const [listings, setListings] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(createForm());
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [inventoryRows, listingRows] = await Promise.all([getInventory(), getEcommerceListings()]);
      setInventory(Array.isArray(inventoryRows) ? inventoryRows : []);
      setListings(Array.isArray(listingRows) ? listingRows : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const selectedInventory = inventory.find((item) => Number(item.id) === Number(form.inventory_item_id));
  const filtered = listings.filter((listing) => {
    const term = search.trim().toLowerCase();
    return !term || [listing.part_number, listing.product_name, listing.brand, listing.motorcycle_model, listing.color]
      .some((value) => String(value || '').toLowerCase().includes(term));
  });

  const openCreate = () => {
    setEditing(null);
    setForm(createForm());
    setPendingFiles([]);
    setError('');
    setModalOpen(true);
  };
  const openEdit = (listing) => {
    setEditing(listing);
    setForm(createForm(listing));
    setPendingFiles([]);
    setError('');
    setModalOpen(true);
  };

  const addFiles = (event) => {
    const files = [...(event.target.files || [])];
    const accepted = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (form.media.length + pendingFiles.length + accepted.length > 10) {
      setError('A listing can contain at most 10 images/videos.');
      event.target.value = '';
      return;
    }
    setPendingFiles((current) => [...current, ...accepted.map((file) => ({
      file,
      media_type: file.type.startsWith('video/') ? 'video' : 'image',
      preview: URL.createObjectURL(file),
    }))]);
    setError('');
    event.target.value = '';
  };

  const moveMedia = (index, direction) => {
    setForm((current) => {
      const media = [...current.media];
      const target = index + direction;
      if (target < 0 || target >= media.length) return current;
      [media[index], media[target]] = [media[target], media[index]];
      return { ...current, media };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!selectedInventory) return setError('Select an inventory item first.');
    if (form.visibility_status === 'active' && form.media.length + pendingFiles.length < 1) {
      return setError('An active listing requires at least one image or video.');
    }
    setSaving(true);
    setError('');
    try {
      const uploaded = [];
      for (const pending of pendingFiles) {
        const url = pending.media_type === 'video'
          ? await uploadProductVideo(pending.file)
          : await uploadProductImage(pending.file);
        uploaded.push({ url, media_type: pending.media_type, alt_text: selectedInventory.product_name || selectedInventory.name });
      }
      const payload = { ...form, inventory_item_id: Number(form.inventory_item_id), media: [...form.media, ...uploaded] };
      if (editing) await updateEcommerceListing(editing.id, payload);
      else await createEcommerceListing(payload);
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError?.message || 'Storefront listing could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Storefront extension"
        title="E-commerce listings"
        description="Select an inventory item, add customer-facing media and description, then control storefront visibility. Core product, price and stock data remain read-only."
        actions={<button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"><Plus size={16} /> Add Listing</button>}
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search part number, product, model, brand or color" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15" />
          </div>
          <p className="text-xs text-slate-500">Online price = Store price + 15%</p>
        </div>
        {loading ? <div className="p-12 text-center text-sm text-slate-500">Loading storefront listings…</div> : filtered.length === 0 ? (
          <div className="p-12 text-center"><Package className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No storefront listings found</p><p className="mt-1 text-xs text-slate-500">Create one by selecting an existing inventory item.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600"><tr>
                <th className="px-4 py-3 text-left">Listing</th><th className="px-4 py-3 text-left">Inventory</th><th className="px-4 py-3 text-right">Store Selling Price</th><th className="px-4 py-3 text-right">E-commerce Price</th><th className="px-4 py-3 text-left">Visibility</th><th className="px-4 py-3 text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{filtered.map((listing) => (
                <tr key={listing.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="h-11 w-11 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">{listing.media?.[0]?.media_type === 'image' ? <img src={resolveProductImageUrl(listing.media[0].url)} alt="" onError={handleProductImageError} className="h-full w-full object-cover" /> : <Video className="m-3 text-slate-400" size={18} />}</div><div><p className="font-semibold text-slate-900">{listing.product_name}</p><p className="font-mono text-[11px] text-slate-500">{listing.part_number}</p></div></div></td>
                  <td className="px-4 py-3 text-slate-600"><p>{listing.motorcycle_model || 'Model not set'}</p><p className="text-xs">{listing.available_stock} available · {listing.box_location || 'No Box'}</p></td>
                  <td className="px-4 py-3 text-right text-slate-600">₱{Number(listing.store_selling_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">₱{Number(listing.ecommerce_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${listing.visibility_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{listing.visibility_status === 'active' ? <Eye size={12} /> : <EyeOff size={12} />}{listing.visibility_status}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => openEdit(listing)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Pencil size={12} /> Edit</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Storefront Listing' : 'Add Storefront Listing'} size="3xl">
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory Item</p><p className="mt-1 text-sm font-semibold text-slate-900">{selectedInventory ? `${selectedInventory.part_number} — ${selectedInventory.product_name || selectedInventory.name}` : 'No inventory item selected'}</p><p className="mt-1 text-xs text-slate-500">Search Inventory by part number, model, brand, color or Box location.</p></div>
              {!editing && <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"><Search size={15} /> {selectedInventory ? 'Change Inventory Item' : 'Choose Inventory Item'}</button>}
            </div>
          </div>

          {selectedInventory && <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[['Part Number', selectedInventory.part_number], ['Product', selectedInventory.product_name || selectedInventory.name], ['Brand', selectedInventory.brand || 'Not set'], ['Motorcycle Model', selectedInventory.motorcycle_model || 'Not set'], ['Color', selectedInventory.color || 'No color specified'], ['Store Selling Price', `₱${Number(selectedInventory.store_selling_price).toFixed(2)}`], ['E-commerce Price (+15%)', `₱${Number(selectedInventory.ecommerce_price).toFixed(2)}`], ['Available Stock', selectedInventory.stock_quantity], ['Box Location', selectedInventory.box_location || 'Not assigned'], ['Inventory Status', selectedInventory.inventory_status || 'active']].map(([label, value]) => <div key={label}><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>)}
          </div>}

          <label className="block text-xs font-semibold text-slate-700">E-commerce Description
            <textarea rows={5} value={form.ecommerce_description} onChange={(event) => setForm((current) => ({ ...current, ecommerce_description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15" />
          </label>

          <div>
            <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-700">Images / Videos (1–10 for active listings)</p><span className="text-xs text-slate-500">{form.media.length + pendingFiles.length}/10</span></div>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-600 hover:border-orange-400 hover:bg-orange-50"><ImagePlus size={18} /> Add media<input type="file" multiple accept="image/*,video/*" onChange={addFiles} className="sr-only" /></label>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {form.media.map((media, index) => <div key={`${media.url}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><div className="aspect-square">{media.media_type === 'image' ? <img src={resolveProductImageUrl(media.url)} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Video className="text-slate-500" /></div>}</div><div className="flex justify-center gap-1 border-t border-slate-200 bg-white p-1"><button type="button" onClick={() => moveMedia(index, -1)} aria-label="Move media earlier" className="rounded p-1 hover:bg-slate-100"><ArrowUp size={13} /></button><button type="button" onClick={() => moveMedia(index, 1)} aria-label="Move media later" className="rounded p-1 hover:bg-slate-100"><ArrowDown size={13} /></button><button type="button" onClick={() => setForm((current) => ({ ...current, media: current.media.filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Remove media" className="rounded p-1 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button></div>{index === 0 && <span className="absolute left-1 top-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-bold text-white">PRIMARY</span>}</div>)}
              {pendingFiles.map((pending, index) => <div key={pending.preview} className="relative overflow-hidden rounded-lg border border-orange-200 bg-orange-50"><div className="aspect-square">{pending.media_type === 'image' ? <img src={pending.preview} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Video className="text-orange-500" /></div>}</div><button type="button" onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove pending media" className="absolute right-1 top-1 rounded bg-white p-1 text-red-600 shadow"><Trash2 size={13} /></button></div>)}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">Visibility
              <select value={form.visibility_status} onChange={(event) => setForm((current) => ({ ...current, visibility_status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="draft">Draft</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select>
            </label>
            <div className="flex flex-wrap items-end gap-4 pb-2">{[['is_featured', 'Featured'], ['is_best_seller', 'Best seller'], ['is_new_arrival', 'New arrival']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} /> {label}</label>)}</div>
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button disabled={saving} type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{saving ? 'Saving and uploading…' : 'Save Listing'}</button></div>
        </form>
      </Modal>

      <InventoryPickerModal
        open={pickerOpen}
        items={inventory}
        listings={listings}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => { setForm((current) => ({ ...current, inventory_item_id: item.id })); setPickerOpen(false); setError(''); }}
      />
    </div>
  );
};

export default StorefrontListingsView;
