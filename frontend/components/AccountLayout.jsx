import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User as UserIcon, Package, MapPin, Heart, RotateCcw, Wallet, ChevronRight } from 'lucide-react';

const menuItems = [
  { path: '/profile', label: 'My Profile', icon: UserIcon },
  { path: '/orders', label: 'My Orders', icon: Package },
  { path: '/my-returns', label: 'Returns', icon: RotateCcw },
  { path: '/addresses', label: 'Address Book', icon: MapPin },
  { path: '/wishlist', label: 'Wishlist', icon: Heart },
];

const AccountLayout = ({ children }) => {
  const location = useLocation();
  const userData = localStorage.getItem('shopCoreUser');
  const user = userData ? JSON.parse(userData) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link to="/" className="hover:text-red-600 transition-colors">Home</Link>
          <ChevronRight size={14} />
          <span className="text-gray-900 font-medium">My Account</span>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* Profile header */}
              {user && (
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-bold text-lg font-display">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{user.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  {user.store_credit !== undefined && user.store_credit > 0 && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                      <Wallet size={16} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">₱{user.store_credit.toFixed(2)} credit</span>
                    </div>
                  )}
                </div>
              )}
              {/* Navigation */}
              <nav className="p-2">
                {menuItems.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5 ${isActive ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default AccountLayout;
