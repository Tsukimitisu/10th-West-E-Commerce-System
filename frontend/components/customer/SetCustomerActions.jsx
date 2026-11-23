import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { addSetToWishlist, removeSetFromWishlist, getWishlist, startProductChat, WISHLIST_SYNC_EVENT } from '../../services/api';
import { getCurrentAuthUser, subscribeAuthChanges } from '../../services/authSession.js';
import { applyPageMetadata, shareStorefrontItem } from '../../utils/storefrontShare.js';
import { richTextToPlainText } from '../../utils/richText.js';
import { resolveProductImageUrl } from '../../utils/productImages.js';

const SetCustomerActions = ({ set, selected }) => {
  const navigate = useNavigate();
  const [favorite, setFavorite] = useState(false);
  const [pending, setPending] = useState(() => new Set());
  const [feedback, setFeedback] = useState('');
  const busy = useRef(new Set());
  const url = `https://10thwestmotoparts.com/sets/${set.id}`;
  const description = richTextToPlainText(set.description) || `Explore ${set.name} at 10th West Moto.`;

  useEffect(() => {
    const previousTitle = document.title;
    const previousMeta = [...document.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[name^="twitter:"]')]
      .map(node => ({ node, content: node.getAttribute('content') }));
    const previousNodes = new Set([...document.head.querySelectorAll('meta')]);
    applyPageMetadata({ title: `${set.name} | 10th West Moto`, description: description.slice(0, 180),
      image: new URL(resolveProductImageUrl(set.image), window.location.origin).href, url, type: 'product' });
    return () => {
      document.title = previousTitle;
      previousMeta.forEach(({ node, content }) => node.setAttribute('content', content || ''));
      document.head.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"],meta[name="description"]').forEach(node => {
        if (!previousNodes.has(node)) node.remove();
      });
    };
  }, [set.name, set.image, description, url]);

  useEffect(() => {
    let alive = true;
    let revision = 0;
    const load = async () => {
      const current = ++revision;
      const user = getCurrentAuthUser();
      if (!user || user.role !== 'customer') { setFavorite(false); return; }
      try {
        const rows = await getWishlist(user.id);
        if (alive && current === revision) setFavorite(rows.some(row => row.reference_type === 'storefront_set' && Number(row.listing_id) === Number(set.id)));
      } catch { if (alive && current === revision) setFeedback('Unable to load favorites. Please try again.'); }
    };
    const onStorage = event => { if (event.key === 'shopCoreWishlistSync') void load(); };
    void load();
    window.addEventListener(WISHLIST_SYNC_EVENT, load);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', load);
    const unsubscribe = subscribeAuthChanges(load);
    return () => { alive = false; unsubscribe(); window.removeEventListener(WISHLIST_SYNC_EVENT, load); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', load); };
  }, [set.id]);

  const customer = () => {
    const user = getCurrentAuthUser();
    if (!user) {
      const returnTo = `/sets/${set.id}`;
      navigate(`/login?redirect=${encodeURIComponent(returnTo)}`, { state: { returnTo } });
      return null;
    }
    if (user.role !== 'customer') { setFeedback('Sign in with a customer account to use this action.'); return null; }
    return user;
  };
  const run = async (action, handler) => {
    if (busy.current.has(action)) return;
    busy.current.add(action); setPending(new Set(busy.current)); setFeedback('');
    try { await handler(); }
    catch (error) { setFeedback(error?.message || 'Unable to complete this action. Please try again.'); }
    finally { busy.current.delete(action); setPending(new Set(busy.current)); }
  };
  const toggleFavorite = () => {
    const user = customer(); if (!user) return;
    void run('favorite', async () => {
      if (favorite) await removeSetFromWishlist(user.id, set.id);
      else await addSetToWishlist(user.id, set.id);
      setFavorite(!favorite);
      setFeedback(favorite ? 'Set removed from favorites.' : 'Set saved to favorites.');
    });
  };
  const messageSeller = () => {
    if (!customer()) return;
    void run('message', async () => {
      const conversation = await startProductChat({ reference_type: 'storefront_set', listing_id: set.id,
        ...(selected ? { selected_product_item_id: selected.id } : {}) });
      navigate(`/messages?conversation=${conversation.id || conversation.conversation_id}`);
    });
  };
  const share = () => void run('share', async () => {
    const result = await shareStorefrontItem({ title: set.name, text: description, url });
    if (result !== 'cancelled') setFeedback(result === 'copied' ? 'Set link copied to clipboard.' : 'Set shared.');
  });

  return <div className="mt-4">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Set actions">
      <button type="button" onClick={toggleFavorite} disabled={pending.has('favorite')} aria-pressed={favorite}
        aria-label={favorite ? 'Remove set from favorites' : 'Add set to favorites'}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${favorite ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
        <Heart size={20} aria-hidden="true" className={favorite ? 'fill-orange-500' : ''} />Favorite
      </button>
      <button type="button" onClick={messageSeller} disabled={pending.has('message')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle size={20} aria-hidden="true" />Message Seller</button>
      <button type="button" onClick={share} disabled={pending.has('share')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Share2 size={20} aria-hidden="true" />Share</button>
    </div>
    {feedback && <p role="status" className="mt-2 text-sm text-slate-600">{feedback}</p>}
  </div>;
};

export default SetCustomerActions;
