import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, ShoppingCart, Heart, User, Menu, X, ChevronDown, Phone, Mail, HelpCircle, LogOut, Package, MapPin, RotateCcw, Shield, Monitor } from 'lucide-react';
import { getCategories } from '../services/api';
import { useCart } from '../context/CartContext';
import CartDrawer from './CartDrawer';

const Navbar = ({ user, onLogout }) => {
  const [categories, setCategories] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => { });
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setCatMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  if (location.pathname === '/pos') return null;

  return (
    <>
      {/* Top utility bar */}
      <div className="bg-gray-900 text-gray-300 text-xs hidden md:block">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-8">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><Phone size={12} /> (02) 8888-1234</span>
            <span className="flex items-center gap-1"><Mail size={12} /> support@10thwestmoto.com</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Free shipping on orders over â‚±2,500</span>
            <Link to="/faq" className="hover:text-white transition-colors flex items-center gap-1"><HelpCircle size={12} /> Help</Link>
            <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
      </div>

      {/* Main navbar */}
      <header className={`sticky top-0 z-50 bg-white transition-shadow duration-300 ${scrolled ? 'shadow-md' : 'shadow-sm'}`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Mobile menu button */}
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900">
              <Menu size={22} />
            </button>

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm font-display">10</span>
              </div>
              <div className="hidden sm:block">
                <span className="font-display font-bold text-gray-900 text-lg leading-none">10TH WEST</span>
                <span className="block text-[10px] font-semibold tracking-[0.2em] text-red-600 uppercase">Moto Parts</span>
              </div>
            </Link>

            {/* Desktop navigation */}
            <nav className="hidden lg:flex items-center gap-1 ml-8">
              <Link to="/" className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/' ? 'text-red-600 bg-red-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
                Home
              </Link>
              <Link to="/shop" className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/shop' ? 'text-red-600 bg-red-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
                Shop
              </Link>
              <div className="relative" onMouseEnter={() => setCatMenuOpen(true)} onMouseLeave={() => setCatMenuOpen(false)}>
                <button className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center gap-1">
                  Categories <ChevronDown size={14} className={`transition-transform ${catMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {catMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 animate-fade-in">
                    {categories.map(cat => (
                      <Link key={cat.id} to={`/shop?category=${cat.id}`} className="block px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors">
                        {cat.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <Link to="/faq" className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/faq' ? 'text-red-600 bg-red-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
                FAQ
              </Link>
              <Link to="/contact" className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/contact' ? 'text-red-600 bg-red-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
                Contact
              </Link>
              {user?.role === 'admin' && (
                <Link to="/admin" className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center gap-1">
                  <Shield size={14} /> Admin
                </Link>
              )}
              {(user?.role === 'admin' || user?.role === 'cashier') && (
                <Link to="/pos" className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center gap-1">
                  <Monitor size={14} /> POS
                </Link>
              )}
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-1">
              {/* Search */}
              <button onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchRef.current?.focus(), 100); }} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                <Search size={20} />
              </button>

              {/* Wishlist */}
              {user && (
                <Link to="/wishlist" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors hidden sm:flex">
                  <Heart size={20} />
                </Link>
              )}

              {/* Cart */}
              <button onClick={() => setCartOpen(true)} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors relative">
                <ShoppingCart size={20} />
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              {/* User menu */}
              {user ? (
                <div ref={userMenuRef} className="relative">
                  <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2">
                    <div className="w-7 h-7 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden md:block text-sm font-medium text-gray-700 max-w-24 truncate">{user.name.split(' ')[0]}</span>
                    <ChevronDown size={14} className="hidden md:block text-gray-400" />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 animate-fade-in">
                      <div className="px-4 py-2 border-b border-gray-100 mb-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                      <Link to="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"><User size={16} /> My Profile</Link>
                      <Link to="/orders" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"><Package size={16} /> My Orders</Link>
                      <Link to="/wishlist" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"><Heart size={16} /> Wishlist</Link>
                      <Link to="/addresses" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"><MapPin size={16} /> Addresses</Link>
                      <Link to="/my-returns" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"><RotateCcw size={16} /> Returns</Link>
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button onClick={() => setShowLogoutConfirm(true)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors w-full">
                          <LogOut size={16} /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="ml-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Search bar dropdown */}
        {searchOpen && (
          <div className="border-t border-gray-100 bg-white animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={searchRef}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search for motorcycle parts, accessories, gear..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <button type="submit" className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">Search</button>
                <button type="button" onClick={() => setSearchOpen(false)} className="p-2.5 text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </form>
            </div>
          </div>
        )}
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl animate-fade-in overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm font-display">10</span>
                </div>
                <span className="font-display font-bold text-gray-900">10TH WEST MOTO</span>
              </Link>
              <button onClick={() => setMobileOpen(false)} className="p-2 text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {user && (
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-bold">{user.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
            <nav className="p-4 space-y-1">
              <Link to="/" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">Home</Link>
              <Link to="/shop" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">Shop All</Link>
              <div className="pt-2 pb-1 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Categories</div>
              {categories.map(cat => (
                <Link key={cat.id} to={`/shop?category=${cat.id}`} onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 ml-2">
                  {cat.name}
                </Link>
              ))}
              <div className="border-t border-gray-100 my-2" />
              <Link to="/faq" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">FAQ</Link>
              <Link to="/contact" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">Contact</Link>
              {user && (
                <>
                  <div className="border-t border-gray-100 my-2" />
                  <Link to="/profile" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">My Profile</Link>
                  <Link to="/orders" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">My Orders</Link>
                  <Link to="/wishlist" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">Wishlist</Link>
                  <Link to="/addresses" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">Address Book</Link>
                  <Link to="/my-returns" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">My Returns</Link>
                </>
              )}
              {user?.role === 'admin' && (
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">Admin Panel</Link>
              )}
              {(user?.role === 'admin' || user?.role === 'cashier') && (
                <Link to="/pos" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600">POS Terminal</Link>
              )}
            </nav>
            <div className="p-4 border-t border-gray-100">
              {user ? (
                <button onClick={() => { onLogout(); setMobileOpen(false); }} className="w-full px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                  <LogOut size={16} /> Sign Out
                </button>
              ) : (
                <div className="space-y-2">
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="block w-full px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium text-center hover:bg-red-700 transition-colors">Sign In</Link>
                  <Link to="/register" onClick={() => setMobileOpen(false)} className="block w-full px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium text-center hover:bg-gray-50 transition-colors">Create Account</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Cart Drawer */}
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-96 border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-red-50 p-3 rounded-2xl">
                <LogOut className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-gray-900">Sign Out?</h3>
                <p className="text-gray-500 font-medium text-sm mt-1">Confirm to logout</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to sign out of your account?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-2xl font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); onLogout(); }}
                className="flex-1 py-3 bg-red-600 text-white rounded-2xl hover:bg-red-700 font-bold shadow-lg hover:shadow-xl transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
