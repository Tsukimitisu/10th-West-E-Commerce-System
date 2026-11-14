import React, { useEffect, useState } from 'react';
import { Check, Loader2, Minus, Plus } from 'lucide-react';
import Modal from '../owner/Modal';
import BrandButton from '../ui/BrandButton';
import { MAX_ITEM_QUANTITY } from '../../constants/commerce.js';
import OptionImage from '../ui/OptionImage.jsx';
import SetOptionCards from './SetOptionCards.jsx';
import { formatPeso } from '../../utils/formatPeso.js';
export { formatPeso } from '../../utils/formatPeso.js';



// One real child item is chosen at a time (no bundle cart). Price and stock
// shown here come from the live item; the backend re-validates on submit.
const SetPurchaseSheet = ({ set, intent, onClose, onAddToCart, onBuyNow, isPending, selectedId, onSelect }) => {
  const options = set?.options || [];
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  // Mobile: bottom sheet. Desktop: centered purchase modal.
  const isDesktop = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 768px)').matches);

  useEffect(() => {
    if (!intent) return;
    if (!options.some(option => option.id === selectedId && option.is_available)) onSelect(options.find(option => option.is_available)?.id ?? null);
    setQuantity(1);
    setMessage('');
  }, [intent]);

  const selected = options.find((option) => option.id === selectedId) || null;
  const maxQty = selected ? Math.min(selected.stock_quantity, MAX_ITEM_QUANTITY) : 1;
  const pending = Boolean(selected && isPending(selected.id));
  const canSubmit = Boolean(selected?.is_available) && quantity >= 1 && quantity <= maxQty && !pending;

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
          <OptionImage src={selected?.image} fallback={set?.image} alt="" width="80" height="80" className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-contain" />
          <div className="min-w-0" aria-live="polite">
            <p className="text-xl font-bold text-orange-700">{selected ? formatPeso(selected.price) : `From ${formatPeso(set?.price)}`}</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{selected ? selected.name : 'Choose an item'}</p>
            {selected && <p className="mt-0.5 text-xs text-slate-600">{selected.stock_quantity} available</p>}
          </div>
        </div>

        <SetOptionCards options={options} selectedId={selectedId} onSelect={id => { onSelect(id);setQuantity(1);setMessage(''); }} cover={set?.image} />

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
