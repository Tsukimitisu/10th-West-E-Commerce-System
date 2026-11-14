import React, { useEffect, useRef, useState } from 'react';
import { uploadProductImage } from '../../services/api.js';
import OptionImage from '../ui/OptionImage.jsx';
import { PRODUCT_IMAGE_ACCEPT } from '../../utils/imageUpload.js';

export default function OptionImageField({ label, value, fallback, images = [], disabled, onChange, onError, onBusy, showPreview = true }) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const active = useRef(true);
  const pending = useRef(null);
  useEffect(() => { active.current = true;return () => {
    active.current = false;
    const operation = pending.current;
    pending.current = null;
    operation?.controller.abort();
    operation?.finish();
  }; },[]);
  const upload = async event => {
    // Capture the input before awaiting; gallery Done/change events may repeat.
    const input = event.currentTarget;
    const file = input.files?.[0];input.value = '';
    if (!file || disabled || pending.current) return;
    let finished = false;
    const operation = { controller:new AbortController(),finish:()=>{if (!finished) {finished=true;onBusy?.(false);}} };
    pending.current = operation;
    setBusy(true);setError('');onBusy?.(true);
    try {
      const url = await uploadProductImage(file,{signal:operation.controller.signal});
      if (active.current && pending.current===operation) { onChange(url);onError?.(''); }
    } catch (failure) {
      if (active.current && pending.current===operation) {
        const message=failure.message || 'Option image could not be uploaded. Please try again.';
        setError(message);onError?.(message);
      }
    } finally {
      if (pending.current===operation) { pending.current=null;if (active.current) setBusy(false); }
      operation.finish();
    }
  };
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    {showPreview && <OptionImage src={value} fallback={fallback} width="48" height="48" className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-contain" />}
    <div className="min-w-0 flex-1 space-y-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800">
        {busy ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
        <input aria-label={`Upload image for ${label}`} className="sr-only" type="file" accept={PRODUCT_IMAGE_ACCEPT} disabled={disabled || busy} onChange={upload} />
      </label>
      {busy && <p role="status" aria-live="polite" className="text-xs text-slate-700">Uploading image. Please wait…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {images.length > 0 && <select aria-label={`Select gallery image for ${label}`} disabled={disabled || busy} value={images.includes(value) ? value : ''} onChange={event => { if (event.target.value) onChange(event.target.value); }} className="block min-h-11 w-full max-w-full rounded-lg border border-slate-300 bg-white px-2 text-xs">
        <option value="">Use a gallery image…</option>{images.map((url,index) => <option key={url} value={url}>Image {index+1}</option>)}
      </select>}
      {value && <button disabled={disabled || busy} type="button" aria-label={`Remove image for ${label}`} onClick={() => onChange(null)} className="min-h-11 px-2 text-xs font-semibold text-red-700">Remove image</button>}
    </div>
  </div>;
}
