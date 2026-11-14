import React, { useEffect, useRef, useState } from 'react';
import { getCarouselDestinations, uploadProductImage } from '../../services/api';
import BrandButton from '../ui/BrandButton';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages';

const ID_TYPES = ['product','set','promotion','category','model'];
const TYPES = [['none','No link · information only'],['product','Product / single listing'],['set','Set listing'],['promotion','Promotion'],['category','Shop category'],['model','Motorcycle model'],['storefront','Storefront page'],['external','External website']];
const PAGES = [['/shop','Shop all parts'],['/contact','Contact the shop'],['/faq','FAQs'],['/return-policy','Return policy'],['/privacy','Privacy policy'],['/terms','Terms of service']];
export const localDateTime = value => {
  if (!value) return '';
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0,16);
};
const money = value => new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' }).format(Number(value || 0));

export function SlidePreview({ form, image }) {
  return <figure><div className="owner-carousel-preview">
    {image && <img key={image} src={image} alt="" width="1600" height="600" onError={event => { event.currentTarget.style.visibility='hidden'; }} />}
    <div><h3>{form.title || 'Your slide headline'}</h3>{form.subtitle && <p>{form.subtitle}</p>}{form.destination_type !== 'none' && <span>{form.button_text || 'View details'}</span>}</div>
  </div><figcaption className="mt-2 text-xs leading-5 text-slate-600">Approximate Home hero crop and overlay. Actual crops adapt to the customer’s screen.</figcaption></figure>;
}

// kind='product' searches active single listings; kind='set' active set listings.
function ProductChoices({ kind = 'product', initial, initialMore = false, selected, onSelect }) {
  const noun = kind === 'set' ? 'set listing' : 'storefront product';
  const [search,setSearch] = useState('');
  const [rows,setRows] = useState(initial);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [more,setMore] = useState(initialMore);
  useEffect(() => {
    let active = true;
    if (!search.trim()) { setRows(initial); setMore(initialMore); setError(''); setLoading(false); return undefined; }
    const timer = setTimeout(() => {
      setLoading(true); setError(''); setRows([]);
      getCarouselDestinations({ type:kind, search:search.trim() }).then(result => { if(active) { setRows((kind === 'set' ? result.sets : result.products) || []); setMore(Boolean(kind === 'set' ? result.hasMoreSets : result.hasMoreProducts)); } }).catch(() => { if(active) setError(`Choices could not be loaded. Change the search to retry.`); }).finally(() => { if(active) setLoading(false); });
    },250);
    return () => { active=false; clearTimeout(timer); };
  },[search,initial,initialMore,kind]);
  return <div className="space-y-2">
    <label className="owner-field">Find a {noun}<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={kind === 'set' ? 'Set title or motorcycle model' : 'Part number, product or motorcycle model'} /></label>
    {error && <p role="alert" className="owner-account-feedback">{error}</p>}
    {loading && <p role="status" className="text-xs text-slate-600">Searching…</p>}
    <div className="owner-picker-results" role="group" aria-label={kind === 'set' ? 'Set listing choices' : 'Storefront product choices'}>
      {rows.length ? rows.map(row => <button type="button" key={row.id} aria-pressed={String(selected)===String(row.id)} onClick={() => onSelect(row.id)}>
        <img src={resolveProductImageUrl(row.image)} alt="" onError={handleProductImageError} width="42" height="42" />
        <span className="min-w-0"><strong>{row.name}</strong><small>{kind === 'set' ? `${row.item_count} items` : row.part_number || 'Part number not set'} · {row.motorcycle_model || 'Check compatibility'}</small><small>{kind === 'set' ? 'Set listing' : money(row.price)}{String(selected)===String(row.id) ? ' · Selected' : ''}</small></span>
      </button>) : !loading && <p className="p-3 text-sm text-slate-600">No visible {noun}s match.</p>}
    </div><p className="text-xs text-slate-600">{more ? 'Showing the first 25 matches. Refine your search.' : kind === 'set' ? 'Only active set listings with an available item can be selected.' : 'Only active storefront listings can be selected.'}</p>
  </div>;
}

export default function CarouselSlideEditor({ slide, nextOrder, onSave, onCancel }) {
  const [form,setForm] = useState(() => ({ title:slide?.title || '', subtitle:slide?.subtitle || '', button_text:slide?.button_text || '', image_url:slide?.image_url || '', alt_text:slide?.alt_text || '',
    destination_type:slide?.destination_type && slide.destination_type!=='legacy' ? slide.destination_type : slide?.link_url ? /^https?:/.test(slide.link_url) ? 'external' : 'storefront' : 'none',
    destination_id:slide?.destination_id || '', link_url:slide?.link_url || '', is_active:slide?.is_active ?? true, display_order:slide?.display_order ?? nextOrder,
    starts_at:localDateTime(slide?.starts_at), ends_at:localDateTime(slide?.ends_at) }));
  const [options,setOptions] = useState(null);
  const [optionsError,setOptionsError] = useState('');
  const [file,setFile] = useState(null);
  const [preview,setPreview] = useState('');
  const [imageError,setImageError] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [uploading,setUploading] = useState(false);
  const errorRef=useRef(null);
  useEffect(() => { if(error) errorRef.current?.focus({preventScroll:false}); },[error]);
  const loadOptions = () => {
    setOptionsError('');
    return getCarouselDestinations({ type:'all', ...(['product','set','promotion'].includes(slide?.destination_type) && slide.destination_id ? { id:slide.destination_id,selected_type:slide.destination_type } : {}) }).then(setOptions).catch(() => setOptionsError('Destinations could not be loaded. Retry before choosing a linked item.'));
  };
  useEffect(() => { loadOptions(); }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url=URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url);
  },[file]);
  const field = (key,value) => setForm(current => ({ ...current,[key]:value }));
  const submit = async event => {
    event.preventDefault(); if(busy || imageError) return;
    setError('');
    if (ID_TYPES.includes(form.destination_type) && !form.destination_id) { setError('Choose a destination for this slide.'); return; }
    if (form.starts_at && form.ends_at && new Date(form.ends_at)<=new Date(form.starts_at)) { setError('End must be after start.'); return; }
    setBusy(true);
    try {
      let image=form.image_url;
      if(file) { setUploading(true); image=await uploadProductImage(file); setUploading(false); }
      await onSave({ ...form,image_url:image,destination_id:form.destination_id ? Number(form.destination_id) : null,
        starts_at:form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at:form.ends_at ? new Date(form.ends_at).toISOString() : null,
        link_url:[...ID_TYPES,'none'].includes(form.destination_type) ? '' : form.link_url });
    } catch(failure) { setError(failure.message || 'Slide could not be saved. Check the details and try again.'); }
    finally { setBusy(false); setUploading(false); }
  };
  const promotion=options?.promotions?.find(row => String(row.id)===String(form.destination_id));
  return <form onSubmit={submit} className="space-y-5">
    <div className="owner-carousel-editor"><div className="space-y-4">
      <label className="owner-field">Title<input required maxLength={120} value={form.title} onChange={event => field('title',event.target.value)} /></label>
      <label className="owner-field">Supporting text<textarea rows={3} maxLength={600} value={form.subtitle} onChange={event => field('subtitle',event.target.value)} /></label>
      <label className="owner-field">Slide image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => {
        const chosen=event.target.files?.[0]; setImageError(''); if(!chosen) { setFile(null); return; }
        if(!['image/jpeg','image/png','image/webp','image/gif'].includes(chosen.type) || chosen.size>5*1024*1024) { setFile(null); event.target.value=''; setImageError('Choose a JPG, PNG, WebP or GIF image no larger than 5 MB.'); return; } setFile(chosen);
      }} /><small>JPG, PNG, WebP or GIF · up to 5 MB. A wide image around 1600 × 600 works well. No image creates a text-only slide.</small></label>
      {imageError && <p role="alert" className="owner-account-feedback">{imageError}</p>}
      <label className="owner-field">Existing image URL<input value={form.image_url} onChange={event => { setFile(null); field('image_url',event.target.value); }} inputMode="url" placeholder="https://… or /uploads/…" /></label>
      <label className="owner-field">Image alt text<input maxLength={255} value={form.alt_text} onChange={event => field('alt_text',event.target.value)} /><small>Optional. Describe meaningful image details; avoid repeating the headline.</small></label>
      <label className="owner-field">Destination type<select value={form.destination_type} onChange={event => setForm(current => ({ ...current,destination_type:event.target.value,destination_id:'',link_url:event.target.value==='storefront' ? '/shop' : '' }))}>{TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {optionsError && <div role="alert" className="owner-account-feedback">{optionsError}<BrandButton variant="ghost" onClick={loadOptions}>Retry destinations</BrandButton></div>}
      {form.destination_type==='product' && (options ? <ProductChoices initial={options.products || []} initialMore={Boolean(options.hasMoreProducts)} selected={form.destination_id} onSelect={id => field('destination_id',id)} /> : <p role="status">Loading product choices…</p>)}
      {form.destination_type==='set' && (options ? <ProductChoices key="set" kind="set" initial={options.sets || []} initialMore={Boolean(options.hasMoreSets)} selected={form.destination_id} onSelect={id => field('destination_id',id)} /> : <p role="status">Loading set choices…</p>)}
      {['promotion','category','model'].includes(form.destination_type) && <label className="owner-field">{form.destination_type==='promotion' ? 'Promotion campaign' : form.destination_type==='category' ? 'Shop category' : 'Motorcycle model'}<select required value={form.destination_id} onChange={event => field('destination_id',event.target.value)}><option value="">Choose a destination</option>{(options?.[form.destination_type==='promotion' ? 'promotions' : form.destination_type==='category' ? 'categories' : 'models'] || []).map(row => <option key={row.id} value={row.id}>{form.destination_type==='promotion' ? `${row.code} · ${row.type==='percentage' ? `${Number(row.value)}%` : money(row.value)} · ${row.is_active ? 'Enabled' : 'Inactive'}${row.expires_at ? ` · ends ${new Date(row.expires_at).toLocaleDateString()}` : ''}` : row.model_name || row.name}</option>)}</select></label>}
      {promotion && <p className="owner-account-feedback">{promotion.code} applies to the order subtotal, subject to its existing limits. The customer opens Shop with this code and terms; checkout validates eligibility. {promotion.starts_at && `Starts ${new Date(promotion.starts_at).toLocaleString()}. `}{promotion.expires_at && `Ends ${new Date(promotion.expires_at).toLocaleString()}.`} A linked slide is public only while the campaign is available.</p>}
      {form.destination_type==='storefront' && <label className="owner-field">Storefront destination<select value={form.link_url} onChange={event => field('link_url',event.target.value)}>{!PAGES.some(([value]) => value===form.link_url) && form.link_url && <option value={form.link_url}>Existing: {form.link_url}</option>}{PAGES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {form.destination_type==='external' && <label className="owner-field">External destination URL<input type="url" required maxLength={500} value={form.link_url} onChange={event => field('link_url',event.target.value)} placeholder="https://example.com" /><small>HTTP(S) only. Customer links open in a separate tab.</small></label>}
      {form.destination_type!=='none' && <label className="owner-field">CTA label<input maxLength={48} value={form.button_text} onChange={event => field('button_text',event.target.value)} placeholder={form.destination_type==='set' ? 'View Set' : form.destination_type==='product' ? 'View Product' : form.destination_type==='promotion' ? 'See Offer' : 'Shop Now'} /></label>}
    </div><div className="space-y-4"><SlidePreview form={form} image={preview || form.image_url} />
      <div className="owner-form-grid"><label className="owner-field">Start date/time<input type="datetime-local" value={form.starts_at} onChange={event => field('starts_at',event.target.value)} /></label><label className="owner-field">End date/time<input type="datetime-local" value={form.ends_at} onChange={event => field('ends_at',event.target.value)} /></label></div>
      <p className="text-xs leading-5 text-slate-600">Dates use your device’s local time and are stored with a timezone. Leave blank for no date limit.</p>
      <label className="owner-field">Display order<input type="number" required min={0} max={9999} step={1} value={form.display_order} onChange={event => field('display_order',Number(event.target.value))} /><small>Lower numbers appear first. Slides with the same number use creation order.</small></label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.is_active} onChange={event => field('is_active',event.target.checked)} className="h-4 w-4 accent-orange-600" />Active slide</label>
    </div></div>
    {error && <p role="alert" tabIndex={-1} ref={errorRef} className="owner-account-feedback">{error}</p>}
    <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4"><BrandButton variant="secondary" onClick={onCancel} disabled={busy}>Cancel</BrandButton><BrandButton type="submit" disabled={busy || Boolean(imageError)}>{uploading ? 'Uploading image…' : busy ? 'Saving…' : slide ? 'Save slide' : 'Create slide'}</BrandButton></div>
  </form>;
}
