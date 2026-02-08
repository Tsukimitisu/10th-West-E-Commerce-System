import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import ProductList from './pages/ProductList';
import Login from './pages/Login';
import Register from './pages/Register';
import ProductDetail from './pages/ProductDetail';
import AdminDashboard from './pages/AdminDashboard';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import PosTerminal from './pages/POS/PosTerminal';
import Profile from './pages/Profile';
import OrderHistory from './pages/OrderHistory';
import OrderDetail from './pages/OrderDetail';
import AddressBook from './pages/AddressBook';
import Contact from './pages/Support/Contact';
import FAQ from './pages/Support/FAQ';
import RequestReturn from './pages/Returns/RequestReturn';
import MyReturns from './pages/Returns/MyReturns';
import Wishlist from './pages/Wishlist';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OAuthCallback from './pages/OAuthCallback';
import { logoutApi } from './services/api.js';
import { supabase, onAuthStateChange } from './services/supabase.js';
import { SocketProvider } from './context/SocketContext.jsx';

const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true';

// Role constants
const Role = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  CASHIER: 'cashier'
};

const AppLayout = ({ user, onLogout, onLogin }) => {
  const location = useLocation();
  const hideChrome = location.pathname === '/pos' || location.pathname === '/admin';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {!hideChrome && <Navbar user={user} onLogout={onLogout} />}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<ProductList />} />
          <Route path="/login" element={<Login onLogin={onLogin} />} />
          <Route path="/register" element={<Register onLogin={onLogin} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/oauth-callback" element={<OAuthCallback onLogin={onLogin} />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" />} />
          <Route path="/orders" element={user ? <OrderHistory /> : <Navigate to="/login" />} />
          <Route path="/orders/:id" element={user ? <OrderDetail /> : <Navigate to="/login" />} />
          <Route path="/orders/:id/return" element={user ? <RequestReturn /> : <Navigate to="/login" />} />
          <Route path="/my-returns" element={user ? <MyReturns /> : <Navigate to="/login" />} />
          <Route path="/addresses" element={user ? <AddressBook /> : <Navigate to="/login" />} />
          <Route path="/wishlist" element={user ? <Wishlist /> : <Navigate to="/login" />} />
          <Route path="/admin" element={user?.role === Role.ADMIN ? <AdminDashboard /> : <Navigate to="/login" replace />} />
          <Route path="/pos" element={(user?.role === Role.ADMIN || user?.role === Role.CASHIER) ? <PosTerminal /> : <Navigate to="/login" replace />} />
        </Routes>
      </div>
      {!hideChrome && <Footer />}
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const initAuth = async () => {
      if (USE_SUPABASE && supabase) {
        try {
        // Check Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();
          
          if (profile) {
            const userData = {
              id: profile.id,
              name: profile.name || session.user.email?.split('@')[0] || 'User',
              email: session.user.email || '',
              role: profile.role || Role.CUSTOMER,
              phone: profile.phone,
              avatar: profile.avatar,
              store_credit: profile.store_credit || 0,
              is_active: profile.is_active ?? true,
              two_factor_enabled: profile.two_factor_enabled || false,
              oauth_provider: session.user.app_metadata?.provider || null,
              last_login: session.user.last_sign_in_at,
              email_verified: session.user.email_confirmed_at != null,
            };
            setUser(userData);
            localStorage.setItem('shopCoreUser', JSON.stringify(userData));
            localStorage.setItem('shopCoreToken', session.access_token);
          }
        }
        } catch (e) {
          console.warn('Supabase auth failed, falling back to localStorage:', e.message);
          const savedUser = localStorage.getItem('shopCoreUser');
          if (savedUser) setUser(JSON.parse(savedUser));
        }
      } else {
        // Fallback to localStorage
        const savedUser = localStorage.getItem('shopCoreUser');
        if (savedUser) setUser(JSON.parse(savedUser));
      }
      setLoading(false);
    };

    initAuth();

    // Subscribe to auth state changes (Supabase)
    if (USE_SUPABASE && supabase) {
      const { data: { subscription } } = onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();
          
          if (profile) {
            const userData = {
              id: profile.id,
              name: profile.name || session.user.email?.split('@')[0] || 'User',
              email: session.user.email || '',
              role: profile.role || Role.CUSTOMER,
              phone: profile.phone,
              avatar: profile.avatar,
              store_credit: profile.store_credit || 0,
              is_active: profile.is_active ?? true,
              two_factor_enabled: profile.two_factor_enabled || false,
              oauth_provider: session.user.app_metadata?.provider || null,
              last_login: session.user.last_sign_in_at,
              email_verified: session.user.email_confirmed_at != null,
            };
            setUser(userData);
            localStorage.setItem('shopCoreUser', JSON.stringify(userData));
            localStorage.setItem('shopCoreToken', session.access_token);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem('shopCoreUser');
          localStorage.removeItem('shopCoreToken');
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const handleLogin = (userData, token) => {
    setUser(userData);
    localStorage.setItem('shopCoreUser', JSON.stringify(userData));
    localStorage.setItem('shopCoreToken', token);
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (e) {
      // Ignore logout errors
    }
    setUser(null);
    localStorage.removeItem('shopCoreUser');
    localStorage.removeItem('shopCoreToken');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <SocketProvider>
      <Router>
        <AppLayout user={user} onLogout={handleLogout} onLogin={handleLogin} />
      </Router>
    </SocketProvider>
  );
};

export default App;
