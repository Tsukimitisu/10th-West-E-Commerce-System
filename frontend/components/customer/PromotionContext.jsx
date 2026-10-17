import React, { useEffect, useState } from 'react';
import { getCarouselPromotion } from '../../services/api';
import { Link } from 'react-router-dom';

// Context for a carousel-linked order-wide coupon. It never alters catalog
// prices, cart totals or checkout eligibility/calculation.
export default function PromotionContext({ id }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    getCarouselPromotion(id).then(promotion => { if (active) setState({ promotion }); }).catch(() => { if (active) setState({ unavailable: true }); });
    return () => { active = false; };
  }, [id]);
  const promotion = state.promotion;
  const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
  return <aside className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-900" aria-label="Store promotion">
    {state.loading ? <p role="status">Loading promotion…</p> : state.unavailable ? <p>This promotion is not currently available. <Link to="/shop" className="font-semibold text-orange-700 underline underline-offset-4">Browse current products</Link></p> : <>
      <p className="font-semibold">{promotion.code} · {promotion.type === 'percentage' ? `${Number(promotion.value)}% off your order subtotal` : `${money(promotion.value)} off your order subtotal`}</p>
      <p className="mt-1 leading-6 text-slate-600">Enter this code at checkout. {Number(promotion.min_purchase) > 0 && `Minimum spend ${money(promotion.min_purchase)}. `}{Number(promotion.max_discount) > 0 && `Maximum discount ${money(promotion.max_discount)}. `}Eligibility is checked at checkout.</p>
    </>}
  </aside>;
}
