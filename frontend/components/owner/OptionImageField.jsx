import React, { useEffect, useRef, useState } from 'react';
import { uploadProductImage } from '../../services/api.js';
import OptionImage from '../ui/OptionImage.jsx';

export default function OptionImageField({ label, value, fallback, images = [], disabled, onChange, onError, onBusy, showPreview = true }) {
  const [busy,setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true;return () => { active.current = false; }; },[]);
  const upload = async event => {
    const file = event.target.files?.[0];event.target.value = '';
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) { onError('Choose an image file for this option.');return; }
    setBusy(true);onBusy?.(true);
    try { const url = await uploadProductImage(file);if (active.current) { onChange(url);onError(''); } }
    catch (error) { if (active.current) onError(error.message || 'Option image could not be uploaded.'); }
    finally { if (active.current) setBusy(false);onBusy?.(false); }
  };
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    {showPreview && <OptionImage src={value} fallback={fallback} width="48" height="48" className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-contain" />}
    <div className="min-w-0 flex-1 space-y-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800">
        {busy ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
        <input aria-label={`Upload image for ${label}`} className="sr-only" type="file" accept="image/*" disabled={disabled || busy} onChange={upload} />
      </label>
      {images.length > 0 && <select aria-label={`Select gallery image for ${label}`} disabled={disabled || busy} value={images.includes(value) ? value : ''} onChange={event => { if (event.target.value) onChange(event.target.value); }} className="block min-h-11 w-full max-w-full rounded-lg border border-slate-300 bg-white px-2 text-xs">
        <option value="">Use a gallery image…</option>{images.map((url,index) => <option key={url} value={url}>Image {index+1}</option>)}
      </select>}
      {value && <button disabled={disabled || busy} type="button" aria-label={`Remove image for ${label}`} onClick={() => onChange(null)} className="min-h-11 px-2 text-xs font-semibold text-red-700">Remove image</button>}
    </div>
  </div>;
}
