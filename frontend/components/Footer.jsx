import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Facebook, Instagram, Youtube, Send, CreditCard, Shield, Truck } from 'lucide-react';

const Footer = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email.trim()) { setSubscribed(true); setEmail(''); }
  };

  return (
    <footer className="bg-gray-900 text-gray-300">
      {/* Newsletter */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-white font-display font-bold text-xl mb-1">Stay in the Loop</h3>
              <p className="text-gray-400 text-sm">Subscribe for exclusive deals, new arrivals, and riding tips.</p>
            </div>
            {subscribed ? (
              <div className="flex items-center gap-2 text-green-400 font-medium">
                <Shield size={18} /> Thanks for subscribing!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex w-full md:w-auto">
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="Enter your email"
                  className="flex-1 md:w-72 px-4 py-3 bg-gray-800 border border-gray-700 rounded-l-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                <button type="submit" className="px-5 py-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-r-lg transition-colors flex items-center gap-2">
                  <Send size={16} /> Subscribe
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm font-display">10</span>
              </div>
              <div>
                <span className="font-display font-bold text-white text-lg leading-none">10TH WEST</span>
                <span className="block text-[10px] font-semibold tracking-[0.2em] text-orange-500 uppercase">Moto Parts</span>
              </div>
            </Link>
            <p className="text-sm text-gray-400 mb-4 leading-relaxed">
              Your trusted source for quality motorcycle parts, accessories, and gear. Ride with confidence.
            </p>
            <div className="space-y-2 text-sm">
              <a href="tel:0288881234" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><Phone size={14} /> (02) 8888-1234</a>
              <a href="mailto:support@10thwestmoto.com" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><Mail size={14} /> support@10thwestmoto.com</a>
              <span className="flex items-center gap-2 text-gray-400"><MapPin size={14} /> Manila, Philippines</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold text-white mb-4">Quick Links</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/shop" className="text-gray-400 hover:text-white transition-colors">Shop All</Link></li>
              <li><Link to="/shop?sort=newest" className="text-gray-400 hover:text-white transition-colors">New Arrivals</Link></li>
              <li><Link to="/shop?sort=best-selling" className="text-gray-400 hover:text-white transition-colors">Best Sellers</Link></li>
              <li><Link to="/shop?sale=true" className="text-gray-400 hover:text-white transition-colors">Sale Items</Link></li>
              <li><Link to="/faq" className="text-gray-400 hover:text-white transition-colors">FAQ</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-white transition-colors">Contact Us</Link></li>
            </ul>
          </div>

          {/* Customer Support */}
          <div>
            <h4 className="font-display font-semibold text-white mb-4">Customer Support</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/orders" className="text-gray-400 hover:text-white transition-colors">Track My Order</Link></li>
              <li><Link to="/my-returns" className="text-gray-400 hover:text-white transition-colors">Returns & Refunds</Link></li>
              <li><Link to="/faq" className="text-gray-400 hover:text-white transition-colors">Shipping Info</Link></li>
              <li><Link to="/faq" className="text-gray-400 hover:text-white transition-colors">Warranty Info</Link></li>
              <li><Link to="/faq" className="text-gray-400 hover:text-white transition-colors">Size Guide</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-white transition-colors">Live Chat</Link></li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="font-display font-semibold text-white mb-4">Connect With Us</h4>
            <div className="flex gap-3 mb-6">
              <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-orange-500 rounded-lg flex items-center justify-center transition-colors"><Facebook size={18} /></a>
              <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-orange-500 rounded-lg flex items-center justify-center transition-colors"><Instagram size={18} /></a>
              <a href="#" className="w-10 h-10 bg-gray-800 hover:bg-orange-500 rounded-lg flex items-center justify-center transition-colors"><Youtube size={18} /></a>
            </div>
            <h4 className="font-display font-semibold text-white mb-3">We Accept</h4>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 bg-gray-800 rounded text-xs font-medium flex items-center gap-1"><CreditCard size={14} /> Visa</span>
              <span className="px-3 py-1.5 bg-gray-800 rounded text-xs font-medium">Mastercard</span>
              <span className="px-3 py-1.5 bg-gray-800 rounded text-xs font-medium">GCash</span>
              <span className="px-3 py-1.5 bg-gray-800 rounded text-xs font-medium">COD</span>
            </div>
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
              <Shield size={14} /> <Truck size={14} /> Secure checkout & fast shipping
            </div>
          </div>
        </div>
      </div>

      {/* Legal / Business Info */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
            <p>&copy; {new Date().getFullYear()} 10th West Moto Parts. All rights reserved.</p>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/return-policy" className="hover:text-white transition-colors">Return Policy</Link>
            </div>
          </div>
          <div className="text-center text-[10px] text-gray-600 leading-relaxed">
            <p>10th West Moto Parts | DTI Business Name Registration No. 3217456 | BIR TIN: 123-456-789-000</p>
            <p>Registered Address: Unit 10, West Avenue Commercial Center, Quezon City, Metro Manila 1104, Philippines</p>
            <p className="mt-1">Data Protection Officer: <a href="mailto:dpo@10thwestmoto.com" className="text-gray-400 hover:text-white">dpo@10thwestmoto.com</a> | NPC Registration No. PIC-001-2025-0001</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
