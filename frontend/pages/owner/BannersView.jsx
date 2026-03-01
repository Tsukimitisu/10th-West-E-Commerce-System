import React, { useState, useEffect } from 'react';
import { Image, Plus, Edit3, Trash2, Eye, EyeOff, X, Check, AlertCircle, GripVertical, Megaphone, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { getAllBanners, createBanner, updateBanner, deleteBanner, getAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../services/api';

const BannersView = () => {
  const [tab, setTab] = useState('banners');
  const [banners, setBanners] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [bannerForm, setBannerForm] = useState({ title: '', subtitle: '', image_url: '', link_url: '', is_active: true, display_order: 0 });
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', is_published: false });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState('banner');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [b, a] = await Promise.all([getAllBanners(), getAllAnnouncements()]);
      setBanners(b || []);
      setAnnouncements(a || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const resetForm = () => {
    setBannerForm({ title: '', subtitle: '', image_url: '', link_url: '', is_active: true, display_order: 0 });
    setAnnouncementForm({ title: '', content: '', is_published: false });
    setEditing(null);
    setShowModal(false);
  };

  const handleBannerSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateBanner(editing.id, bannerForm);
        setBanners(banners.map(b => b.id === editing.id ? (updated.banner || updated) : b));
      } else {
        const created = await createBanner(bannerForm);
        setBanners([...banners, created.banner || created]);
      }
      resetForm();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleAnnouncementSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...announcementForm };
      if (payload.is_published && !editing?.published_at) payload.published_at = new Date().toISOString();
      if (editing) {
        const updated = await updateAnnouncement(editing.id, payload);
        setAnnouncements(announcements.map(a => a.id === editing.id ? (updated.announcement || updated) : a));
      } else {
        const created = await createAnnouncement(payload);
        setAnnouncements([...announcements, created.announcement || created]);
      }
      resetForm();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDeleteBanner = (banner) => {
    setDeleteTarget(banner);
    setDeleteType('banner');
  };

  const handleDeleteAnnouncement = (announcement) => {
    setDeleteTarget(announcement);
    setDeleteType('announcement');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteType === 'banner') {
        await deleteBanner(deleteTarget.id);
        setBanners(banners.filter(b => b.id !== deleteTarget.id));
      } else {
        await deleteAnnouncement(deleteTarget.id);
        setAnnouncements(announcements.filter(a => a.id !== deleteTarget.id));
      }
    } catch (e) { console.error(e); }
    setDeleteTarget(null);
  };

  const toggleBannerActive = async (banner) => {
    try {
      const updated = await updateBanner(banner.id, { ...banner, is_active: !banner.is_active });
      setBanners(banners.map(b => b.id === banner.id ? (updated.banner || updated) : b));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Image size={22} /> Content Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage banners, promotions & announcements</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
          <Plus size={16} /> {tab === 'banners' ? 'Add Banner' : 'Add Announcement'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('banners')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'banners' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          <Image size={14} /> Banners ({banners.length})
        </button>
        <button onClick={() => setTab('announcements')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'announcements' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          <Megaphone size={14} /> Announcements ({announcements.length})
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : tab === 'banners' ? (
        /* Banners List */
        banners.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
            <Image size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">No banners yet</h3>
            <p className="text-sm text-gray-500">Create banners to display on the homepage.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {banners.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map(banner => (
              <div key={banner.id} className={`bg-white border rounded-xl p-4 flex gap-4 items-center ${banner.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
                <div className="w-24 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {banner.image_url ? <img src={banner.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Image size={20} className="text-gray-300" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{banner.title || 'Untitled Banner'}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${banner.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {banner.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                  {banner.subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{banner.subtitle}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">Order: {banner.display_order || 0}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleBannerActive(banner)} className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors" title={banner.is_active ? 'Hide' : 'Show'}>
                    {banner.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => { setBannerForm({ title: banner.title || '', subtitle: banner.subtitle || '', image_url: banner.image_url || '', link_url: banner.link_url || '', is_active: banner.is_active, display_order: banner.display_order || 0 }); setEditing(banner); setShowModal(true); }}
                    className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors"><Edit3 size={14} /></button>
                  <button onClick={() => handleDeleteBanner(banner)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Announcements List */
        announcements.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
            <Megaphone size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">No announcements</h3>
            <p className="text-sm text-gray-500">Create announcements to keep customers informed.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(ann => (
              <div key={ann.id} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 text-sm">{ann.title}</h3>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ann.is_published ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                        {ann.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ann.content}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{ann.published_at ? new Date(ann.published_at).toLocaleDateString() : 'Not published'}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <button onClick={() => { setAnnouncementForm({ title: ann.title || '', content: ann.content || '', is_published: ann.is_published }); setEditing(ann); setShowModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors"><Edit3 size={14} /></button>
                    <button onClick={() => handleDeleteAnnouncement(ann)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{editing ? 'Edit' : 'Add'} {tab === 'banners' ? 'Banner' : 'Announcement'}</h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {tab === 'banners' ? (
              <form onSubmit={handleBannerSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                  <input type="text" value={bannerForm.title} onChange={e => setBannerForm({ ...bannerForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Subtitle</label>
                  <input type="text" value={bannerForm.subtitle} onChange={e => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                  <input type="url" value={bannerForm.image_url} onChange={e => setBannerForm({ ...bannerForm, image_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Link URL</label>
                  <input type="url" value={bannerForm.link_url} onChange={e => setBannerForm({ ...bannerForm, link_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" placeholder="https://..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Display Order</label>
                    <input type="number" value={bannerForm.display_order} onChange={e => setBannerForm({ ...bannerForm, display_order: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={bannerForm.is_active} onChange={e => setBannerForm({ ...bannerForm, is_active: e.target.checked })}
                        className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                      Active
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={saving}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors">
                    {saving ? 'Saving...' : (editing ? 'Update Banner' : 'Create Banner')}
                  </button>
                  <button type="button" onClick={resetForm} className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAnnouncementSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                  <input type="text" required value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Content *</label>
                  <textarea required value={announcementForm.content} onChange={e => setAnnouncementForm({ ...announcementForm, content: e.target.value })} rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 resize-none" />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={announcementForm.is_published} onChange={e => setAnnouncementForm({ ...announcementForm, is_published: e.target.checked })}
                    className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                  Publish immediately
                </label>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={saving}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors">
                    {saving ? 'Saving...' : (editing ? 'Update' : 'Create')}
                  </button>
                  <button type="button" onClick={resetForm} className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900">Delete {deleteType === 'banner' ? 'Banner' : 'Announcement'}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this {deleteType}? This cannot be undone.</p>
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

export default BannersView;
