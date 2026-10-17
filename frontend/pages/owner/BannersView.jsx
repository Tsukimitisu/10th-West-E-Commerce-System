import React, { useState, useEffect, useRef } from 'react';
import { Image, Plus, Edit3, Trash2, Eye, EyeOff, X, Check, AlertCircle, GripVertical, Megaphone, ArrowUp, ArrowDown, AlertTriangle, Upload, Link as LinkIcon, SlidersHorizontal, Save } from 'lucide-react';
import { getAllBanners, createBanner, updateBanner, deleteBanner, getAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, uploadProductImage, getSystemSettings, updateSystemSettings, getAnnouncementToggle, updateAnnouncementToggle } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import Modal from '../../components/owner/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { handleProductImageError } from '../../utils/productImages.js';

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
  const [modalType, setModalType] = useState('banner');
  const [editing, setEditing] = useState(null);
  const [bannerForm, setBannerForm] = useState({ title: '', subtitle: '', button_text: '', image_url: '', link_url: '', is_active: true, display_order: 0 });
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
  const [announcementsEnabled, setAnnouncementsEnabled] = useState(true);
  const [savingAnnouncementsToggle, setSavingAnnouncementsToggle] = useState(false);
  const [savingCarousel, setSavingCarousel] = useState(false);
  const [carouselSaved, setCarouselSaved] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [b, a, homeSettings, announcementsEnabledValue] = await Promise.all([
        getAllBanners(),
        getAllAnnouncements(),
        getSystemSettings('home').catch(() => []),
        getAnnouncementToggle().catch(() => true),
      ]);

      setBanners(b || []);
      setAnnouncements(a || []);
      setAnnouncementsEnabled(announcementsEnabledValue !== false);

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
    setBannerForm({ title: '', subtitle: '', button_text: '', image_url: '', link_url: '', is_active: true, display_order: 0 });
    setAnnouncementForm({ title: '', content: '', is_published: false });
    setModalType(tab === 'announcements' ? 'announcement' : 'banner');
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

  const handleAnnouncementVisibilityToggle = async () => {
    const previousValue = announcementsEnabled;
    const nextValue = !previousValue;

    setAnnouncementsEnabled(nextValue);
    setSavingAnnouncementsToggle(true);
    try {
      const result = await updateAnnouncementToggle(nextValue);
      if (typeof result?.enabled !== 'undefined') {
        setAnnouncementsEnabled(Boolean(result.enabled));
      }
    } catch (e) {
      console.error(e);
      setAnnouncementsEnabled(previousValue);
    }
    setSavingAnnouncementsToggle(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Banners & announcements" description="Preview storefront visuals and manage their visibility and order." actions={tab !== 'carousel' && <button type="button" onClick={() => { resetForm(); setModalType(tab === 'announcements' ? 'announcement' : 'banner'); setShowModal(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700"><Plus size={16} aria-hidden="true" /> Add {tab === 'banners' ? 'banner' : 'announcement'}</button>} />

      {/* Tabs */}
      <div tabIndex={0} className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Content type">
        <button role="tab" aria-selected={tab === 'banners'} onClick={() => setTab('banners')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'banners' ? 'bg-white text-red-500 ' : 'text-gray-600 hover:text-white'}`}>
          <Image size={14} /> Banners ({banners.length})
        </button>
        <button role="tab" aria-selected={tab === 'announcements'} onClick={() => setTab('announcements')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'announcements' ? 'bg-white text-red-500 ' : 'text-gray-600 hover:text-white'}`}>
          <Megaphone size={14} /> Announcements ({announcements.length})
        </button>
        <button role="tab" aria-selected={tab === 'carousel'} onClick={() => setTab('carousel')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${tab === 'carousel' ? 'bg-white text-red-500 ' : 'text-gray-600 hover:text-white'}`}>
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
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <Image size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-white mb-1">No banners yet</h3>
            <p className="text-sm text-gray-400">Create banners to display on the homepage.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...banners].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map(banner => (
              <div key={banner.id} className={`rounded-xl border bg-white p-4 sm:flex sm:items-center sm:gap-4 ${banner.is_active ? 'border-slate-200' : 'border-slate-300'}`}>
                <div className="w-24 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {banner.image_url ? <img src={banner.image_url} alt="" onError={handleProductImageError} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Image size={20} className="text-slate-500" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-sm truncate">{banner.title || 'Untitled Banner'}</h3>
                    <StatusBadge tone={banner.is_active ? 'success' : 'neutral'}>{banner.is_active ? 'Active' : 'Hidden'}</StatusBadge>
                  </div>
                  {banner.subtitle && <p className="text-xs text-gray-400 truncate mt-0.5">{banner.subtitle}</p>}
                  {banner.button_text && <p className="text-[10px] text-gray-400 mt-0.5">Button: {banner.button_text}</p>}
                  <p className="mt-1 text-xs text-slate-600">Placement: Home announcements · Priority {banner.display_order || 0}</p>
                </div>
                <div className="mt-3 flex items-center gap-1 sm:mt-0">
                  <button aria-label={`${banner.is_active ? 'Hide' : 'Show'} ${banner.title || 'banner'}`} onClick={() => toggleBannerActive(banner)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" title={banner.is_active ? 'Hide' : 'Show'}>
                    {banner.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => { setBannerForm({ title: banner.title || '', subtitle: banner.subtitle || '', button_text: banner.button_text || '', image_url: banner.image_url || '', link_url: banner.link_url || '', is_active: banner.is_active, display_order: banner.display_order || 0 }); setEditing(banner); setImagePreview(banner.image_url || ''); setLinkMode(LINK_OPTIONS.some(o => o.value === banner.link_url) ? 'page' : (banner.link_url ? 'custom' : 'page')); setModalType('banner'); setShowModal(true); }}
                    aria-label={`Edit ${banner.title || 'banner'}`} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><Edit3 size={16} /></button>
                  <button aria-label={`Delete ${banner.title || 'banner'}`} onClick={() => handleDeleteBanner(banner)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-700 hover:bg-red-50"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'announcements' ? (
        /* Announcements List */
        <div className="space-y-3">
          <div className={`border rounded-xl p-4 flex items-start justify-between gap-3 ${announcementsEnabled ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white border-slate-200'}`}>
            <div>
              <h3 className="text-sm font-semibold text-white">Announcement Visibility</h3>
              <p className="text-xs text-gray-300 mt-1">
                {announcementsEnabled
                  ? 'Announcements are ON. Published announcements are visible to customers.'
                  : 'Announcements are OFF. Customers will not see any announcements.'}
              </p>
            </div>
            <button
              onClick={handleAnnouncementVisibilityToggle}
              disabled={savingAnnouncementsToggle}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-60 ${announcementsEnabled ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30' : 'bg-gray-900 border-gray-600 text-gray-200 hover:bg-gray-700'}`}
            >
              {announcementsEnabled ? <Eye size={13} /> : <EyeOff size={13} />}
              {savingAnnouncementsToggle ? 'Saving...' : (announcementsEnabled ? 'ON' : 'OFF')}
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <Megaphone size={48} className="mx-auto text-gray-300 mb-3" />
              <h3 className="font-semibold text-white mb-1">No announcements</h3>
              <p className="text-sm text-gray-400">Create announcements to keep customers informed.</p>
            </div>
          ) : announcements.map(ann => (
            <div key={ann.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-sm">{ann.title}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ann.is_published ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                      {ann.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ann.content}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{ann.published_at ? new Date(ann.published_at).toLocaleDateString() : 'Not published'}</p>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => { setAnnouncementForm({ title: ann.title || '', content: ann.content || '', is_published: ann.is_published }); setEditing(ann); setModalType('announcement'); setShowModal(true); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors"><Edit3 size={14} /></button>
                  <button onClick={() => handleDeleteAnnouncement(ann)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-white">Home Hero Carousel Management</h3>
            <p className="text-sm text-gray-400 mt-1">These options apply to the Home page hero only.</p>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">Slides</h4>
                <p className="text-xs text-gray-400">Each slide supports image, title, description, and button text.</p>
              </div>
              <button
                onClick={() => {
                  setBannerForm({ title: '', subtitle: '', button_text: '', image_url: '', link_url: '/shop', is_active: true, display_order: banners.length });
                  setEditing(null);
                  setImagePreview('');
                  setLinkMode('page');
                  setModalType('banner');
                  setShowModal(true);
                }}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Slide
              </button>
            </div>

            <div className="space-y-2">
              {banners.length === 0 ? (
                <p className="text-xs text-gray-400">No slides yet.</p>
              ) : [...banners].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((banner) => (
                <div key={banner.id} className="border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-20 h-14 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                    {banner.image_url ? (
                      <img src={banner.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Image size={16} className="text-gray-300" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{banner.title || 'Untitled'}</p>
                    <p className="text-xs text-gray-400 truncate">{banner.subtitle || 'No description'}</p>
                    <p className="text-[11px] text-gray-400 truncate">Button: {banner.button_text || 'Shop Parts'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleBannerActive(banner)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors" title={banner.is_active ? 'Hide' : 'Show'}>
                      {banner.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => {
                        setBannerForm({ title: banner.title || '', subtitle: banner.subtitle || '', button_text: banner.button_text || '', image_url: banner.image_url || '', link_url: banner.link_url || '', is_active: banner.is_active, display_order: banner.display_order || 0 });
                        setEditing(banner);
                        setImagePreview(banner.image_url || '');
                        setLinkMode(LINK_OPTIONS.some(o => o.value === banner.link_url) ? 'page' : (banner.link_url ? 'custom' : 'page'));
                        setModalType('banner');
                        setShowModal(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => handleDeleteBanner(banner)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Autoplay slides</p>
              <p className="text-[11px] text-gray-400">Automatically rotate banners in the hero section.</p>
            </div>
            <input
              type="checkbox"
              checked={carouselConfig.hero_autoplay}
              onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_autoplay: e.target.checked }))}
              className="w-4 h-4 text-red-500 border-gray-300 rounded"
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
              className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
              <span className="text-sm text-gray-800">Show dots</span>
              <input
                type="checkbox"
                checked={carouselConfig.hero_show_dots}
                onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_show_dots: e.target.checked }))}
                className="w-4 h-4 text-red-500 border-gray-300 rounded"
              />
            </label>
            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
              <span className="text-sm text-gray-800">Show arrows</span>
              <input
                type="checkbox"
                checked={carouselConfig.hero_show_arrows}
                onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_show_arrows: e.target.checked }))}
                className="w-4 h-4 text-red-500 border-gray-300 rounded"
              />
            </label>
          </div>

          <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Pause on hover</p>
              <p className="text-[11px] text-gray-400">Improves readability while users hover the hero on desktop.</p>
            </div>
            <input
              type="checkbox"
              checked={carouselConfig.hero_pause_on_hover}
              onChange={e => setCarouselConfig(cfg => ({ ...cfg, hero_pause_on_hover: e.target.checked }))}
              className="w-4 h-4 text-red-500 border-gray-300 rounded"
            />
          </label>

          <div className="pt-2">
            <button
              onClick={handleSaveCarouselConfig}
              disabled={savingCarousel}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Save size={14} /> {savingCarousel ? 'Saving...' : (carouselSaved ? 'Saved!' : 'Save Carousel Settings')}
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={showModal} onClose={resetForm} title={`${editing ? 'Edit' : 'Add'} ${modalType === 'banner' ? 'banner' : 'announcement'}`} size="lg">

            {modalType === 'banner' ? (
              <form onSubmit={handleBannerSubmit} className="space-y-4">
                <div>
                  <label htmlFor="banner-title" className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                  <input id="banner-title" type="text" value={bannerForm.title} onChange={e => setBannerForm({ ...bannerForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300" />
                </div>
                <div>
                  <label htmlFor="banner-description" className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input id="banner-description" type="text" value={bannerForm.subtitle} onChange={e => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300" />
                </div>
                <div>
                  <label htmlFor="banner-button-text" className="block text-xs font-medium text-gray-600 mb-1">Button Text</label>
                  <input
                    id="banner-button-text"
                    type="text"
                    value={bannerForm.button_text}
                    onChange={e => setBannerForm({ ...bannerForm, button_text: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300"
                    placeholder="Shop Parts"
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <span className="block text-xs font-medium text-gray-600 mb-1">Banner Image</span>
                  {(imagePreview || bannerForm.image_url) ? (
                    <div className="relative group">
                      <img src={imagePreview || bannerForm.image_url} onError={handleProductImageError} alt="Banner preview" className="w-full h-40 object-cover rounded-lg border border-slate-200" />
                      <div className="mt-2 flex items-center gap-2">
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
                    <button type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      className="w-full rounded-lg border-2 border-dashed border-slate-300 p-6 text-center hover:border-orange-500 hover:bg-orange-50 transition-colors"
                    >
                      <Upload size={24} className="mx-auto text-gray-300 mb-2" />
                      <span className="block text-sm text-gray-600 font-medium">Choose an image or drag and drop</span>
                      <span className="mt-1 block text-[11px] text-gray-500">PNG, JPG, WEBP, GIF (max 5MB)</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageFileChange} className="sr-only" aria-label="Upload banner image" />
                </div>

                {/* Link URL - Page Selector */}
                <div>
                  <span className="block text-xs font-medium text-gray-600 mb-1">Link Destination</span>
                  <div className="flex gap-1 mb-2">
                    <button type="button" onClick={() => { setLinkMode('page'); setBannerForm({ ...bannerForm, link_url: LINK_OPTIONS[0].value }); }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${linkMode === 'page' ? 'bg-orange-50 text-orange-800' : 'text-gray-400 hover:text-gray-700 bg-gray-900'}`}>
                      <LinkIcon size={10} className="inline mr-1" />Store Page
                    </button>
                    <button type="button" onClick={() => { setLinkMode('custom'); setBannerForm({ ...bannerForm, link_url: '' }); }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${linkMode === 'custom' ? 'bg-orange-50 text-orange-800' : 'text-gray-400 hover:text-gray-700 bg-gray-900'}`}>
                      Custom URL
                    </button>
                  </div>
                  {linkMode === 'page' ? (
                    <select aria-label="Store page destination" value={bannerForm.link_url} onChange={e => setBannerForm({ ...bannerForm, link_url: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300 bg-white">
                      {LINK_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input aria-label="Custom banner destination" type="text" value={bannerForm.link_url} onChange={e => setBannerForm({ ...bannerForm, link_url: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300"
                      placeholder="/shop or https://example.com" />
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">Where should the banner link to when clicked?</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="banner-order" className="block text-xs font-medium text-gray-600 mb-1">Display Order</label>
                    <input id="banner-order" type="number" value={bannerForm.display_order} onChange={e => setBannerForm({ ...bannerForm, display_order: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300" />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={bannerForm.is_active} onChange={e => setBannerForm({ ...bannerForm, is_active: e.target.checked })}
                        className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-orange-500" />
                      Active
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={saving || uploading}
                    className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                    {uploading ? (<><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading image...</>) :
                     saving ? 'Saving...' : (editing ? 'Update Banner' : 'Create Banner')}
                  </button>
                  <button type="button" onClick={resetForm} className="px-4 py-2.5 border border-slate-200 text-gray-600 text-sm rounded-lg hover:bg-gray-900">Cancel</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAnnouncementSubmit} className="space-y-4">
                <div>
                  <label htmlFor="announcement-title" className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                  <input id="announcement-title" type="text" required value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300" />
                </div>
                <div>
                  <label htmlFor="announcement-content" className="block text-xs font-medium text-gray-600 mb-1">Content *</label>
                  <textarea id="announcement-content" required value={announcementForm.content} onChange={e => setAnnouncementForm({ ...announcementForm, content: e.target.value })} rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-red-300 resize-none" />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={announcementForm.is_published} onChange={e => setAnnouncementForm({ ...announcementForm, is_published: e.target.checked })}
                    className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-orange-500" />
                  Publish immediately
                </label>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={saving}
                    className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors">
                    {saving ? 'Saving...' : (editing ? 'Update' : 'Create')}
                  </button>
                  <button type="button" onClick={resetForm} className="px-4 py-2.5 border border-slate-200 text-gray-600 text-sm rounded-lg hover:bg-gray-900">Cancel</button>
                </div>
              </form>
            )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={`Delete ${deleteType}`} size="sm">
          {deleteTarget && <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
              <h3 className="text-lg font-bold text-white">Delete {deleteType === 'banner' ? 'Banner' : 'Announcement'}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this {deleteType}? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl">Delete</button>
            </div>
          </>}
      </Modal>
    </div>
  );
};

export default BannersView;


