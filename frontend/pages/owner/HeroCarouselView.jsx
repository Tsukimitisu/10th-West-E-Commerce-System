import React, { useEffect, useState } from 'react';
import { Image, Plus, Pencil, Trash2 } from 'lucide-react';
import { getAllBanners, createBanner, updateBanner, deleteBanner, getAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, getAnnouncementToggle, updateAnnouncementToggle } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import BrandButton from '../../components/ui/BrandButton';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/owner/Modal';
import CarouselSlideEditor, { localDateTime } from '../../components/owner/CarouselSlideEditor';
import { ConfirmationDialog } from '../../components/ui/BrandPrimitives';
import { richTextToPlainText } from '../../utils/richText';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages';

const slideStatus = row => !row.is_active ? { label:'Inactive', tone:'neutral' } : row.starts_at && Date.parse(row.starts_at)>Date.now() ? { label:'Scheduled', tone:'neutral' } : row.ends_at && Date.parse(row.ends_at)<=Date.now() ? { label:'Expired', tone:'neutral' } : { label:'Active', tone:'success' };
const date = value => value ? new Date(value).toLocaleString() : null;
const schedule = row => row.starts_at || row.ends_at ? `${row.starts_at ? date(row.starts_at) : 'Any time'} → ${row.ends_at ? date(row.ends_at) : 'No end'}` : 'No date limit';
const destination = row => row.destination_type==='none' || !row.link_url && !row.destination_id ? 'No link · information only' : `${row.destination_type && row.destination_type!=='legacy' ? `${row.destination_type.charAt(0).toUpperCase()}${row.destination_type.slice(1)} · ` : ''}${row.destination_label || row.link_url || `Item #${row.destination_id}`}${row.destination_unavailable ? ' · Destination unavailable; hidden from Home' : ''}`;

function AnnouncementEditor({ item, onSave, onCancel }) {
  const [form,setForm] = useState({ title:item?.title || '', content:item?.content || '', is_published:item?.is_published || false, published_at:localDateTime(item?.published_at) });
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave({ ...form,published_at:form.published_at ? new Date(form.published_at).toISOString() : form.is_published ? new Date().toISOString() : null }); }
    catch(failure) { setError(failure.message || 'Announcement could not be saved.'); }
    finally { setBusy(false); }
  }}>
    <p className="text-sm leading-6 text-slate-600">Published text announcements appear in the same Home hero, after the image slides.</p>
    <label className="owner-field">Announcement title<input required maxLength={120} value={form.title} onChange={event => setForm({ ...form,title:event.target.value })} /></label>
    <label className="owner-field">Announcement text<textarea required rows={5} maxLength={5000} value={form.content} onChange={event => setForm({ ...form,content:event.target.value })} /></label>
    <label className="owner-field">Publish from<input type="datetime-local" value={form.published_at} onChange={event => setForm({ ...form,published_at:event.target.value })} /></label>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.is_published} onChange={event => setForm({ ...form,is_published:event.target.checked })} />Published</label>
    {error && <p role="alert" className="owner-account-feedback">{error}</p>}
    <div className="flex flex-wrap justify-end gap-3"><BrandButton variant="secondary" onClick={onCancel} disabled={busy}>Cancel</BrandButton><BrandButton type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save announcement'}</BrandButton></div>
  </form>;
}

export default function HeroCarouselView() {
  const [rows,setRows] = useState([]); const [announcements,setAnnouncements] = useState([]);
  const [enabled,setEnabled] = useState(true); const [tab,setTab] = useState('slides');
  const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [message,setMessage] = useState('');
  const [editor,setEditor] = useState(null); const [deleting,setDeleting] = useState(null); const [busy,setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    const results = await Promise.allSettled([getAllBanners(),getAllAnnouncements(),getAnnouncementToggle()]);
    if(results[0].status==='fulfilled') setRows(results[0].value || []); else setError('Hero slides could not be loaded. Please retry.');
    if(results[1].status==='fulfilled') setAnnouncements(results[1].value || []); else setError(current => current || 'Text announcements could not be loaded. Please retry.');
    if(results[2].status==='fulfilled') setEnabled(results[2].value!==false);
    setLoading(false);
  };
  useEffect(() => { load(); },[]);
  const sorted = [...rows].sort((a,b) => Number(a.display_order)-Number(b.display_order) || Number(a.id)-Number(b.id));
  const saveSlide = async value => {
    const result = editor?.item ? await updateBanner(editor.item.id,value) : await createBanner(value);
    const row=result.banner || result;
    setRows(previous => editor?.item ? previous.map(item => item.id===row.id ? row : item) : [...previous,row]);
    setEditor(null); setMessage('Hero slide saved. Active slides appear on Home within their schedule.');
  };
  const actions = row => <div className="owner-slide-actions"><BrandButton size="sm" variant="secondary" onClick={() => setEditor({ type:'slide',item:row })} aria-label={`Edit slide ${row.title}`}><Pencil size={14} aria-hidden="true" />Edit</BrandButton><BrandButton size="sm" variant="ghost" onClick={() => setDeleting({ type:'slide',item:row })} aria-label={`Delete slide ${row.title}`}><Trash2 size={15} aria-hidden="true" /></BrandButton></div>;
  const confirmDelete = async () => {
    if(!deleting || busy) return; setBusy(true); setError('');
    try {
      if(deleting.type==='slide') { await deleteBanner(deleting.item.id); setRows(previous => previous.filter(row => row.id!==deleting.item.id)); }
      else { await deleteAnnouncement(deleting.item.id); setAnnouncements(previous => previous.filter(row => row.id!==deleting.item.id)); }
      setDeleting(null); setMessage('Content deleted.');
    } catch(failure) { setError(failure.message || 'Content could not be deleted. Try again.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <PageHeader title="Hero Carousel" description="Manage promotional slides displayed in the Home page hero." actions={<BrandButton onClick={() => setEditor({ type:tab==='slides' ? 'slide' : 'announcement' })}><Plus size={16} aria-hidden="true" />{tab==='slides' ? 'Add slide' : 'Add announcement'}</BrandButton>} />
    <nav className="brand-tabs" aria-label="Hero content"><button type="button" aria-current={tab==='slides' ? 'page' : undefined} onClick={() => setTab('slides')}>Hero slides ({rows.length})</button><button type="button" aria-current={tab==='announcements' ? 'page' : undefined} onClick={() => setTab('announcements')}>Text announcements ({announcements.length})</button></nav>
    {error && <div role="alert" className="owner-account-feedback">{error}<BrandButton variant="ghost" onClick={load}>Retry</BrandButton></div>}
    {message && <p role="status" className="owner-account-feedback">{message}</p>}
    {loading ? <div role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm">Loading hero content…</div> : tab==='slides' ? <>
      <p className="text-sm leading-6 text-slate-600">Lower display orders appear first. Only active slides within their date range are public. Linked products must remain storefront-visible; linked promotions must be currently available.</p>
      {!rows.length ? <EmptyState icon={Image} title="No hero slides yet" description="Add a slide with an image, message and optional storefront destination. Home keeps its branded fallback until content is active." action={<BrandButton onClick={() => setEditor({ type:'slide' })}>Add first slide</BrandButton>} /> : <section aria-label="Managed hero slides" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="owner-slide-table" tabIndex={0} role="region" aria-label="Hero slide records"><table className="w-full"><thead><tr>{['Preview','Slide','Destination','Schedule','Status','Order','Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{sorted.map(row => <tr key={row.id} className="border-t border-slate-200"><td><img className="owner-slide-thumb" src={resolveProductImageUrl(row.image_url)} alt="" onError={handleProductImageError} width="88" height="56" /></td><td><p className="max-w-52 break-words font-semibold text-slate-900">{row.title}</p><p className="owner-slide-meta">{row.button_text || 'No CTA label'}</p></td><td><p className="owner-slide-meta max-w-52">{destination(row)}</p></td><td><p className="owner-slide-meta max-w-44">{schedule(row)}</p></td><td><StatusBadge tone={slideStatus(row).tone}>{slideStatus(row).label}</StatusBadge></td><td className="font-mono">{row.display_order}</td><td>{actions(row)}</td></tr>)}</tbody></table></div>
        <div className="owner-slide-cards">{sorted.map(row => <article key={row.id} className="owner-slide-card"><img className="owner-slide-thumb" src={resolveProductImageUrl(row.image_url)} alt="" width="88" height="56" onError={handleProductImageError} /><div className="min-w-0 space-y-2"><h2 className="break-words text-base font-semibold">{row.title}</h2><StatusBadge tone={slideStatus(row).tone}>{slideStatus(row).label}</StatusBadge><p className="owner-slide-meta">{destination(row)}<br />{schedule(row)}<br />Order {row.display_order}</p>{actions(row)}</div></article>)}</div>
      </section>}
    </> : <>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={async event => {
        const value=event.target.checked; setBusy(true); setError('');
        try { await updateAnnouncementToggle(value); setEnabled(value); }
        catch(failure) { setError(failure.message || 'Announcement visibility could not be saved.'); }
        finally { setBusy(false); }
      }} />Show published text announcements in the Home hero</label>
      <p className="text-sm text-slate-600">These use the existing announcement records and publish date. They do not create a second promotional area.</p>
      {!announcements.length ? <EmptyState title="No text announcements" description="Use a short shop update when an image slide is unnecessary." /> : <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">{announcements.map(item => <article key={item.id} className="border-b border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-base font-semibold">{item.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{richTextToPlainText(item.content || '')}</p><p className="mt-2 text-xs text-slate-600">{item.is_published ? item.published_at && Date.parse(item.published_at)>Date.now() ? 'Scheduled' : 'Published' : 'Draft'}{item.published_at ? ` · ${date(item.published_at)}` : ''}</p></div><div className="flex gap-2"><BrandButton variant="secondary" onClick={() => setEditor({ type:'announcement',item })}>Edit</BrandButton><BrandButton variant="ghost" onClick={() => setDeleting({ type:'announcement',item })}>Delete</BrandButton></div></div></article>)}</div>}
    </>}
    <Modal isOpen={Boolean(editor)} onClose={() => setEditor(null)} title={editor?.type==='announcement' ? editor.item ? 'Edit text announcement' : 'Add text announcement' : editor?.item ? 'Edit hero slide' : 'Create hero slide'} size={editor?.type==='announcement' ? 'lg' : '3xl'}>
      {editor?.type==='slide' && <CarouselSlideEditor key={editor.item?.id || 'new'} slide={editor.item} nextOrder={rows.length ? Math.min(9999,Math.max(...rows.map(row => Number(row.display_order) || 0))+1) : 0} onSave={saveSlide} onCancel={() => setEditor(null)} />}
      {editor?.type==='announcement' && <AnnouncementEditor item={editor.item} onCancel={() => setEditor(null)} onSave={async value => {
        const result=editor.item ? await updateAnnouncement(editor.item.id,value) : await createAnnouncement(value); const row=result.announcement || result;
        setAnnouncements(previous => editor.item ? previous.map(item => item.id===row.id ? row : item) : [...previous,row]); setEditor(null); setMessage('Text announcement saved.');
      }} />}
    </Modal>
    <ConfirmationDialog isOpen={Boolean(deleting)} title={`Delete ${deleting?.type==='slide' ? 'hero slide' : 'announcement'}?`} description="This removes the selected content from management and the storefront. This action cannot be undone." danger busy={busy} confirmLabel="Delete" onClose={() => { if(!busy) setDeleting(null); }} onConfirm={confirmDelete} presentation="owner-confirmation" />
  </div>;
}
