import React, { useState, useEffect, useRef } from 'react';
import { Image, Plus, Edit3, Trash2, Eye, EyeOff, X, Check, AlertCircle, GripVertical, Megaphone, ArrowUp, ArrowDown, AlertTriangle, Upload, Link as LinkIcon, SlidersHorizontal, Save } from 'lucide-react';
import { getAllBanners, createBanner, updateBanner, deleteBanner, getAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, uploadProductImage, getSystemSettings, updateSystemSettings } from '../../services/api';

const LINK_OPTIONS = [
  { value: '/shop', label: 'Shop - All Products' },
  { value: '/', label: 'Home Page' },
  { value: '/contact', label: 'Contact Us' },
  { value: '/faq', label: 'FAQ' },
  { value: '/privacy', label: 'Privacy Policy' },
  { value: '/terms', label: 'Terms of Service' },
  { value: '/return-policy', label: 'Return Policy' },
];

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
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [linkMode, setLinkMode] = useState('page'); // 'page' or 'custom'
  const [carouselConfig, setCarouselConfig] = useState({
    hero_autoplay: true,
    hero_interval_ms: '5000',
    hero_show_dots: true,
    hero_show_arrows: true,
    hero_pause_on_hover: true,
  });
  const [savingCarousel, setSavingCarousel] = useState(false);
  const [carouselSaved, setCarouselSaved] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [b, a, homeSettings] = await Promise.all([
        getAllBanners(),
        getAllAnnouncements(),
        getSystemSettings('home').catch(() => []),
      ]);
      setBanners(b || []);
      setAnnouncements(a || []);

      const map = {};
      (Array.isArray(homeSettings) ? homeSettings : []).forEach((row) => {
        map[row.key] = row.value;
      });
      setCarouselConfig({
        hero_autoplay: map.hero_autoplay !== 'false',
        hero_interval_ms: map.hero_interval_ms || '5000',
        hero_show_dots: map.hero_show_dots !== 'false',
        hero_show_arrows: map.hero_show_arrows !== 'false',
        hero_pause_on_hover: map.hero_pause_on_hover !== 'false',
      });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSaveCarouselConfig = async () => {
    setSavingCarousel(true);
    try {
      await updateSystemSettings('home', {
        hero_autoplay: String(carouselConfig.hero_autoplay),
        hero_interval_ms: String(carouselConfig.hero_interval_ms || '5000'),
        hero_show_dots: String(carouselConfig.hero_show_dots),
        hero_show_arrows: String(carouselConfig.hero_show_arrows),
        hero_pause_on_hover: String(carouselConfig.hero_pause_on_hover),
      });
      setCarouselSaved(true);
      setTimeout(() => setCarouselSaved(false), 1800);
    } catch (e) {
      console.error(e);
    }
    setSavingCarousel(false);
  };

  const resetForm = () => {
    setBannerForm({ title: '', subtitle: '', image_url: '', link_url: '', is_active: true, display_order: 0 });
    setAnnouncementForm({ title: '', content: '', is_published: false });
    setEditing(null);
    setShowModal(false);
    setSelectedImageFile(null);
    setImagePreview('');
    setLinkMode('page');
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setSelectedImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setSelectedImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setSelectedImageFile(null);
    setImagePreview('');
    setBannerForm({ ...bannerForm, image_url: '' });
  };

  const handleBannerSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let finalImageUrl = bannerForm.image_url;
      if (selectedImageFile) {
        setUploading(true);
        finalImageUrl = await uploadProductImage(selectedImageFile);
        setUploading(false);
      }
      const payload = { ...bannerForm, image_url: finalImageUrl };
      if (editing) {
        const updated = await updateBanner(editing.id, payload);
        setBanners(banners.map(b => b.id === editing.id ? (updated.banner || updated) : b));
      } else {
        const created = await createBanner(payload);
        setBanners([...banners, created.banner || created]);
      }
      resetForm();
    } catch (e) { console.error(e); }
    setSaving(false);
    setUploading(false);
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
        {tab !== 'carousel' && (
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
            <Plus size={16} /> {tab === 'banners' ? 'Add Banner' : 'Add Announcement'}
          </button>
        )}
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
        <button onClick={() => setTab('carousel')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'carousel' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          <SlidersHorizontal size={14} /> Carousel
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
                  <button onClick={() => { setBannerForm({ title: banner.title || '', subtitle: banner.subtitle || '', image_url: banner.image_url || '', link_url: banner.link_url || '', is_active: banner.is_active, display_order: banner.display_order || 0 }); setEditing(banner); setImagePreview(banner.image_url || ''); setLinkMode(LINK_OPTIONS.some(o => o.value === banner.link_url) ? 'page' : (banner.link_url ? 'custom' : 'page')); setShowModal(true); }}
                    className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors"><Edit3 size={14} /></button>
                  <button onClick={() => handleDeleteBanner(banner)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'announcements' ? (
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
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Home Hero Carousel Management</h3>
            <p className="text-sm text-gray-500 mt-1">These options apply to the Home page hero only.</p>
          </div>

          <label className="flex items-center justify-between p-3 border border-gray-100 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-gray-900">Autoplay slides</p>
              <p className="text-[11px] text-gray-500">Automatically rotate banners in the hero section.</p>
            </div>
            <input
              type="checkbox"
              checked={carouselConfig.hero_autoplay}
              onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_autoplay: e.target.checked }))}
              className="w-4 h-4 text-orange-500 border-gray-300 rounded"
            />
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Slide interval (milliseconds)</label>
            <input
              type="number"
              min="2000"
              step="500"
              value={carouselConfig.hero_interval_ms}
              onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_interval_ms: e.target.value }))}
              className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center justify-between p-3 border border-gray-100 rounded-lg cursor-pointer">
              <span className="text-sm text-gray-800">Show dots</span>
              <input
                type="checkbox"
                checked={carouselConfig.hero_show_dots}
                onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_show_dots: e.target.checked }))}
                className="w-4 h-4 text-orange-500 border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center justify-between p-3 border border-gray-100 rounded-lg cursor-pointer">
              <span className="text-sm text-gray-800">Show arrows</span>
              <input
                type="checkbox"
                checked={carouselConfig.hero_show_arrows}
                onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_show_arrows: e.target.checked }))}
                className="w-4 h-4 text-orange-500 border-gray-300 rounded"
              />
            </label>
          </div>

          <label className="flex items-center justify-between p-3 border border-gray-100 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-gray-900">Pause on hover</p>
              <p className="text-[11px] text-gray-500">Improves readability while users hover the hero on desktop.</p>
            </div>
            <input
              type="checkbox"
              checked={carouselConfig.hero_pause_on_hover}
              onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_pause_on_hover: e.target.checked }))}
              className="w-4 h-4 text-orange-500 border-gray-300 rounded"
            />
          </label>

          <div className="pt-2">
            <button
              onClick={handleSaveCarouselConfig}
              disabled={savingCarousel}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Save size={14} /> {savingCarousel ? 'Saving...' : (carouselSaved ? 'Saved!' : 'Save Carousel Settings')}
            </button>
          </div>
        </div>
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

                {/* Image Upload */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Banner Image</label>
                  {(imagePreview || bannerForm.image_url) ? (
                    <div className="relative group">
                      <img src={imagePreview || bannerForm.image_url} alt="Preview" className="w-full h-40 object-cover rounded-lg border border-gray-200" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100">
                          Change
                        </button>
                        <button type="button" onClick={clearImage}
                          className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600">
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                    >
                      <Upload size={24} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500 font-medium">Click to upload or drag & drop</p>
                      <p className="text-[11px] text-gray-400 mt-1">PNG, JPG, WEBP, GIF (max 5MB)</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageFileChange} className="hidden" />
                </div>

                {/* Link URL - Page Selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Link Destination</label>
                  <div className="flex gap-1 mb-2">
                    <button type="button" onClick={() => { setLinkMode('page'); setBannerForm({ ...bannerForm, link_url: LINK_OPTIONS[0].value }); }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${linkMode === 'page' ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50'}`}>
                      <LinkIcon size={10} className="inline mr-1" />Store Page
                    </button>
                    <button type="button" onClick={() => { setLinkMode('custom'); setBannerForm({ ...bannerForm, link_url: '' }); }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${linkMode === 'custom' ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50'}`}>
                      Custom URL
                    </button>
                  </div>
                  {linkMode === 'page' ? (
                    <select value={bannerForm.link_url} onChange={e => setBannerForm({ ...bannerForm, link_url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 bg-white">
                      {LINK_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={bannerForm.link_url} onChange={e => setBannerForm({ ...bannerForm, link_url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300"
                      placeholder="/shop or https://example.com" />
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">Where should the banner link to when clicked?</p>
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
                  <button type="submit" disabled={saving || uploading}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                    {uploading ? (<><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading image...</>) :
                     saving ? 'Saving...' : (editing ? 'Update Banner' : 'Create Banner')}
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
