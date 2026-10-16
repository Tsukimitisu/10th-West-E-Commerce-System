import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Mail, MessageCircle, Music2, Youtube } from 'lucide-react';
import BrandMark from './ui/BrandMark';

const normalizeExternalUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
};

const Footer = () => {
  const supportEmail = String(import.meta.env.VITE_SUPPORT_EMAIL || '').trim();
  const socialLinks = [
    { label: 'Facebook', href: import.meta.env.VITE_SOCIAL_FACEBOOK, icon: Facebook },
    { label: 'Instagram', href: import.meta.env.VITE_SOCIAL_INSTAGRAM, icon: Instagram },
    { label: 'YouTube', href: import.meta.env.VITE_SOCIAL_YOUTUBE, icon: Youtube },
    { label: 'TikTok', href: import.meta.env.VITE_SOCIAL_TIKTOK, icon: Music2 },
  ]
    .map((item) => ({ ...item, href: normalizeExternalUrl(item.href) }))
    .filter((item) => item.href);

  return (
    <footer className="storefront-footer text-slate-300">
      <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col items-start justify-between gap-5 border-b border-white/10 pb-8 md:flex-row md:items-center">
          <BrandMark dark link />
          <p className="max-w-sm text-sm leading-6 text-slate-300">Motorcycle Parts & Accessories.<br />Dependable parts. Practical shop support.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          <div><h2 className="text-white">Shop</h2><ul className="mt-4 space-y-3 text-sm"><li><Link to="/shop">All parts</Link></li><li><Link to="/shop?sort=newest">New arrivals</Link></li><li><Link to="/shop?sort=best-selling">Best sellers</Link></li><li><Link to="/wishlist">Wishlist</Link></li></ul></div>
          <div><h2 className="text-white">Customer support</h2><ul className="mt-4 space-y-3 text-sm"><li><Link to="/orders">Orders & tracking</Link></li><li><Link to="/my-returns">Returns & refunds</Link></li><li><Link to="/faq">Help & FAQ</Link></li><li><Link to="/messages">Buyer messages</Link></li></ul></div>
          <div><h2 className="text-white">Policies</h2><ul className="mt-4 space-y-3 text-sm"><li><Link to="/return-policy">Return policy</Link></li><li><Link to="/privacy">Privacy policy</Link></li><li><Link to="/terms">Terms & conditions</Link></li></ul><p className="mt-5 text-sm text-slate-300">COD · GCash</p><p className="mt-1 text-xs text-slate-400">Available methods appear at checkout.</p></div>
          <div><h2 className="text-white">Contact</h2><div className="mt-4 space-y-3 text-sm"><Link to="/contact" className="flex items-center gap-2"><MessageCircle size={16} aria-hidden="true" />Talk to the shop</Link>{supportEmail && <a href={`mailto:${supportEmail}`} className="flex items-center gap-2 break-all"><Mail size={16} aria-hidden="true" />{supportEmail}</a>}</div>{socialLinks.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{socialLinks.map(({label,href,icon:Icon}) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`10th West Moto on ${label}`} className="grid h-11 w-11 place-items-center rounded-md border border-white/20 hover:text-orange-300"><Icon size={18} aria-hidden="true" /></a>)}</div>}</div>
        </div>
      </div>
      <div className="border-t border-white/10"><div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><p>© {new Date().getFullYear()} 10th West Motorcycle Parts & Accessories</p><div className="flex gap-5"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/return-policy">Returns</Link></div></div></div>
    </footer>
  );
};

export default Footer;
