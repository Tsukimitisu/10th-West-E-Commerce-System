import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Mail, MessageCircle, Music2, ShieldCheck, Truck, Youtube } from 'lucide-react';
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
    <footer className="border-t border-white/10 bg-[#080d19] text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
          <div>
            <BrandMark dark link className="mb-5" />
            <p className="max-w-sm text-sm leading-6 text-slate-400">
              Motorcycle parts, riding gear, and practical support for riders across the Philippines.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold">
                <ShieldCheck size={15} className="text-emerald-400" /> Secure checkout
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold">
                <Truck size={15} className="text-orange-400" /> Tracked delivery
              </span>
            </div>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold text-white">Shop</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li><Link to="/shop" className="transition-colors hover:text-white">All products</Link></li>
              <li><Link to="/shop?sort=newest" className="transition-colors hover:text-white">New arrivals</Link></li>
              <li><Link to="/shop?sort=best-selling" className="transition-colors hover:text-white">Best sellers</Link></li>
              <li><Link to="/wishlist" className="transition-colors hover:text-white">Wishlist</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold text-white">Customer care</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li><Link to="/orders" className="transition-colors hover:text-white">Orders and tracking</Link></li>
              <li><Link to="/my-returns" className="transition-colors hover:text-white">Returns</Link></li>
              <li><Link to="/return-policy" className="transition-colors hover:text-white">Return policy</Link></li>
              <li><Link to="/faq" className="transition-colors hover:text-white">Frequently asked questions</Link></li>
              <li><Link to="/contact" className="transition-colors hover:text-white">Contact support</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold text-white">Payments and support</h2>
            <p className="mt-4 text-sm leading-6 text-slate-400">Checkout supports Cash on Delivery and GCash when available for your order.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">COD</span>
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">GCash</span>
            </div>
            <div className="mt-5 space-y-2 text-sm">
              <Link to="/messages" className="flex items-center gap-2 transition-colors hover:text-white">
                <MessageCircle size={16} /> Buyer messages
              </Link>
              {supportEmail && (
                <a href={`mailto:${supportEmail}`} className="flex items-center gap-2 transition-colors hover:text-white">
                  <Mail size={16} /> {supportEmail}
                </a>
              )}
            </div>
            {socialLinks.length > 0 && (
              <div className="mt-5 flex gap-2">
                {socialLinks.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`10th West Moto on ${label}`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 transition-colors hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-white"
                  >
                    <Icon size={17} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>&copy; {new Date().getFullYear()} 10th West Moto. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-slate-300">Privacy</Link>
            <Link to="/terms" className="hover:text-slate-300">Terms</Link>
            <Link to="/return-policy" className="hover:text-slate-300">Returns</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
