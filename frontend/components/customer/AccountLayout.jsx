import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { getCurrentAuthUser } from '../../services/authSession.js';
const menuItems = [
  { path: '/profile', label: 'Profile' }, { path: '/orders', label: 'Orders' },
  { path: '/addresses', label: 'Addresses' },
  { path: '/messages', label: 'Messages' },
];
const AccountLayout = ({ children }) => {
  const location = useLocation();
  const user = getCurrentAuthUser();
  const storeCredit = Number(user?.store_credit ?? 0);
  const navigation = useRef(null);
  const activePath = location.pathname.startsWith('/orders/') ? '/orders' : location.pathname;
  useEffect(() => {
    const nav = navigation.current;
    const active = nav?.querySelector('[aria-current="page"]');
    if (nav && active) nav.scrollLeft = Math.max(0, active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2);
  }, [activePath]);
  return <div className="account-workspace min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="customer-account-heading">
        <div><p className="text-sm text-slate-600">{user?.name || '10th West customer'}</p><h1>My Account</h1></div>
        {Number.isFinite(storeCredit) && storeCredit > 0 && <p className="inline-flex items-center gap-2 text-sm text-slate-700"><Wallet size={17} aria-hidden="true" />{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(storeCredit)} store credit</p>}
      </header>
      <nav ref={navigation} className="customer-account-nav" aria-label="Account navigation">
        {menuItems.map(item => <Link key={item.path} to={item.path} aria-current={activePath === item.path ? 'page' : undefined}>{item.label}</Link>)}
      </nav>
      <main className="min-w-0">{children}</main>
    </div>
  </div>;
};
export default AccountLayout;
