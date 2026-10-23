import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Minus, Plus } from 'lucide-react';
import Modal from '../owner/Modal';
import BrandButton from '../ui/BrandButton';
import { MAX_ITEM_QUANTITY } from '../../constants/commerce.js';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';

export const formatPeso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One real child item is chosen at a time (no bundle cart). Price and stock
// shown here come from the live item; the backend re-validates on submit.
const SetPurchaseSheet = ({ set, intent, onClose, onAddToCart, onBuyNow, isPending }) => {
  const options = set?.options || [];
  const [selectedId, setSelectedId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const optionRefs = useRef([]);
  // Mobile: bottom sheet. Desktop: centered purchase modal.
  const isDesktop = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 768px)').matches);

  useEffect(() => {
    if (!intent) return;
    setSelectedId((current) => (options.some((option) => option.id === current && option.is_available) ? current : options.find((option) => option.is_available)?.id ?? null));
    setQuantity(1);
    setMessage('');
  }, [intent]);

  const selected = options.find((option) => option.id === selectedId) || null;
  const maxQty = selected ? Math.min(selected.stock_quantity, MAX_ITEM_QUANTITY) : 1;
  const pending = Boolean(selected && isPending(selected.id));
  const canSubmit = Boolean(selected?.is_available) && quantity >= 1 && quantity <= maxQty && !pending;

  const choose = (option) => {
    if (!option.is_available) return;
    setSelectedId(option.id);
    setQuantity((current) => Math.max(1, Math.min(current, option.stock_quantity, MAX_ITEM_QUANTITY)));
    setMessage('');
  };

  const handleOptionKeyDown = (event, index) => {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    for (let offset = 1; offset <= options.length; offset += 1) {
      const next = (index + step * offset + options.length) % options.length;
      if (options[next].is_available) { optionRefs.current[next]?.focus(); choose(options[next]); return; }
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (intent === 'buy') { onBuyNow(selected, quantity); return; }
    const added = await onAddToCart(selected, quantity);
    if (added) setMessage(`Added ${quantity} × ${selected.name} to cart.`);
  };

  return (
    <Modal isOpen={Boolean(intent)} onClose={onClose} title={intent === 'buy' ? 'Buy now' : 'Add to cart'} size="2xl" presentation={isDesktop ? 'modal' : 'sheet'}>
      <div className="set-purchase-sheet" data-testid="set-purchase-sheet">
        <div className="mb-4 flex items-start gap-4">
          <img src={resolveProductImageUrl(selected?.image || set?.image)} onError={handleProductImageError} alt="" width="80" height="80" className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-contain" />
          <div className="min-w-0" aria-live="polite">
            <p className="text-xl font-bold text-orange-700">{selected ? formatPeso(selected.price) : `From ${formatPeso(set?.price)}`}</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{selected ? selected.name : 'Choose an item'}</p>
            {selected && <p className="mt-0.5 text-xs text-slate-600">{selected.stock_quantity} available</p>}
          </div>
        </div>

        <p id="set-option-heading" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Choose item</p>
        <div role="radiogroup" aria-labelledby="set-option-heading" className="mb-5 grid max-h-[42vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {options.map((option, index) => {
            const isSelected = option.id === selectedId;
            return (
              <button
                key={option.id}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={!option.is_available || undefined}
                tabIndex={isSelected || (!selectedId && index === options.findIndex((entry) => entry.is_available)) ? 0 : -1}
                onClick={() => choose(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                data-testid="set-option"
                className={`flex min-h-16 items-center gap-3 rounded-lg border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${isSelected ? 'border-orange-600 bg-orange-50 ring-1 ring-orange-600' : 'border-slate-200 bg-white hover:border-slate-400'} ${option.is_available ? '' : 'cursor-not-allowed opacity-55'}`}
              >
                <img src={resolveProductImageUrl(option.image)} onError={handleProductImageError} alt="" width="48" height="48" className="h-12 w-12 shrink-0 rounded-md border border-slate-200 bg-white object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{option.name}</span>
                  <span className="block truncate text-xs text-slate-600">{[option.color, option.part_number && `Part # ${option.part_number}`].filter(Boolean).join(' · ')}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">{option.price == null ? '' : formatPeso(option.price)}</span>
                    <span className={option.is_available ? 'text-slate-600' : 'font-semibold text-red-700'}>{option.is_available ? `${option.stock_quantity} in stock` : option.unavailable_reason}</span>
                  </span>
                </span>
                {isSelected && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-600 text-white"><Check size={14} aria-hidden="true" /><span className="sr-only">Selected</span></span>}
              </button>
            );
          })}
        </div>

        <div className="mb-5 flex items-center justify-between gap-4">
          <span id="set-qty-label" className="text-sm font-semibold text-slate-900">Quantity</span>
          <div className="flex items-center rounded-lg border border-slate-300" role="group" aria-labelledby="set-qty-label">
            <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="grid h-11 w-11 place-items-center disabled:opacity-40"><Minus size={18} aria-hidden="true" /></button>
            <output aria-live="polite" aria-label="Quantity" className="w-10 text-center font-semibold">{quantity}</output>
            <button type="button" aria-label="Increase quantity" disabled={!selected || quantity >= maxQty} onClick={() => setQuantity((current) => Math.min(maxQty, current + 1))} className="grid h-11 w-11 place-items-center disabled:opacity-40"><Plus size={18} aria-hidden="true" /></button>
          </div>
        </div>
        {message && <p role="status" className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><Check size={16} aria-hidden="true" />{message}</p>}
        <div className="purchase-sheet-action">
          <BrandButton className="w-full" size="lg" disabled={!selected?.is_available} aria-disabled={pending || undefined} aria-busy={pending || undefined} onClick={submit} data-testid="set-purchase-submit">
            {pending ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" />Adding…</> : intent === 'buy' ? 'Buy Now' : 'Add to Cart'}
          </BrandButton>
          {!options.some((option) => option.is_available) && <p className="mt-2 text-center text-sm text-slate-600">All items in this set are currently unavailable.</p>}
        </div>
      </div>
    </Modal>
  );
};

export default SetPurchaseSheet;
