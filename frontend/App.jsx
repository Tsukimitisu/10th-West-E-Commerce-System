import React, { useState, useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import ProductList from './pages/ProductList';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ProductDetail from './pages/ProductDetail';
import AdminDashboard from './pages/owner/AdminDashboard';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import Cart from './pages/customer/Cart';
import Checkout from './pages/customer/Checkout';
import OrderConfirmation from './pages/customer/OrderConfirmation';
import PosTerminal from './pages/staff/PosTerminal';
import Profile from './pages/customer/Profile';
import OrderHistory from './pages/customer/OrderHistory';
import OrderDetail from './pages/customer/OrderDetail';
import AddressBook from './pages/customer/AddressBook';
import Contact from './pages/Support/Contact';
import FAQ from './pages/Support/FAQ';
import PrivacyPolicy from './pages/Support/PolicyPrivacy';
import TermsOfService from './pages/Support/TermsOfService';
import ReturnPolicy from './pages/Support/ReturnPolicy';
import PrivacyBanner from './components/PrivacyBanner';
import EmailVerificationBanner from './components/EmailVerificationBanner';
import RequestReturn from './pages/customer/RequestReturn';
import MyReturns from './pages/customer/MyReturns';
import Wishlist from './pages/customer/Wishlist';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OAuthCallback from './pages/OAuthCallback';
import { getProfile, logoutApi, initializeSecurityContext } from './services/api.js';
import { supabase, onAuthStateChange } from './services/supabase.js';
import { SocketProvider } from './context/SocketContext.jsx';
import { Role } from './types.js';

const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true';

const AppLayout = ({ user, onLogout, onLogin }) => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const hideChrome = location.pathname === '/pos' || location.pathname === '/admin' || location.pathname === '/super-admin';

  // Super Admin can ONLY access /super-admin — redirect everything else
  if (isSuperAdmin && location.pathname !== '/super-admin' && location.pathname !== '/login') {
    return <Navigate to="/super-admin" replace />;
  }

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col">
      {!hideChrome && !isSuperAdmin && <Navbar user={user} onLogout={onLogout} />}
      {!hideChrome && !isSuperAdmin && user && <EmailVerificationBanner user={user} />}
      <div className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${location.pathname}${location.search}`}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="h-full"
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/shop" element={<ProductList />} />
              <Route path="/login" element={
                user && (user.role === Role.OWNER || user.role === Role.STORE_STAFF || user.role === Role.ADMIN)
                  ? <Navigate to="/admin" replace />
                  : user && user.role === Role.SUPER_ADMIN
                    ? <Navigate to="/super-admin" replace />
                    : user
                      ? <Navigate to="/" replace />
                      : <Login onLogin={onLogin} />
              } />
              <Route path="/register" element={<Register onLogin={onLogin} />} />
              <Route path="/verify-email" element={<VerifyEmail onLogin={onLogin} />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/oauth-callback" element={<OAuthCallback onLogin={onLogin} />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route
                path="/checkout"
                element={
                  user
                    ? <Checkout />
                    : <Navigate to={`/login?redirect=/checkout${location.search ? `&${location.search.slice(1)}` : ''}`} />
                }
              />
              <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/return-policy" element={<ReturnPolicy />} />
              <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" />} />
              <Route path="/orders" element={user ? <OrderHistory /> : <Navigate to="/login" />} />
              <Route path="/orders/:id" element={user ? <OrderDetail /> : <Navigate to="/login" />} />
              <Route path="/orders/:id/return" element={user ? <RequestReturn /> : <Navigate to="/login" />} />
              <Route path="/my-returns" element={user ? <MyReturns /> : <Navigate to="/login" />} />
              <Route path="/addresses" element={user ? <AddressBook /> : <Navigate to="/login" />} />
              <Route path="/wishlist" element={user ? <Wishlist /> : <Navigate to="/login" />} />
              <Route path="/admin" element={user?.role === Role.OWNER || user?.role === Role.STORE_STAFF || user?.role === Role.ADMIN ? <AdminDashboard user={user} onLogout={onLogout} /> : <Navigate to="/login" replace />} />
              <Route path="/super-admin" element={user?.role === Role.SUPER_ADMIN ? <SuperAdminDashboard user={user} /> : <Navigate to="/login" replace />} />
              <Route path="/pos" element={(user?.role === Role.OWNER || user?.role === Role.STORE_STAFF) ? <PosTerminal /> : <Navigate to="/login" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
      {!hideChrome && !isSuperAdmin && <Footer />}
      <PrivacyBanner />
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const disposeSecurity = initializeSecurityContext();
    return () => {
      disposeSecurity?.();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const clearLocalSession = () => {
      localStorage.removeItem('shopCoreUser');
      localStorage.removeItem('shopCoreToken');
      if (isMounted) setUser(null);
    };

    const buildLocalTokenFromUser = (profile) =>
      `sb-token-${btoa(JSON.stringify({ id: profile.id, email: profile.email, role: profile.role }))}`;

    const syncUserFromStorage = () => {
      const token = localStorage.getItem('shopCoreToken');
      if (!token) {
        localStorage.removeItem('shopCoreUser');
        if (isMounted) setUser(null);
        return;
      }
      const savedUser = localStorage.getItem('shopCoreUser');
      if (!savedUser) return;
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.id && isMounted) {
          setUser(parsed);
        }
      } catch {
        clearLocalSession();
      }
    };

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
              const token = buildLocalTokenFromUser(userData);
              if (isMounted) setUser(userData);
              localStorage.setItem('shopCoreUser', JSON.stringify(userData));
              localStorage.setItem('shopCoreToken', token);
            }
          }
        } catch (e) {
          console.error('Supabase auth init error:', e);
        }
      }

      // Restore user from localStorage only if token exists.
      const token = localStorage.getItem('shopCoreToken');
      const savedUser = localStorage.getItem('shopCoreUser');
      if (!token) {
        clearLocalSession();
      } else if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.id && isMounted) {
            setUser(parsed);
          }
        } catch (e) {
          console.error('Failed to parse saved user:', e);
          clearLocalSession();
        }
      }

      // Validate active token and refresh profile to avoid stale/broken sessions.
      if (localStorage.getItem('shopCoreToken')) {
        try {
          const profile = await getProfile();
          if (isMounted) setUser(profile);
          localStorage.setItem('shopCoreUser', JSON.stringify(profile));
        } catch {
          clearLocalSession();
        }
      }

      const handleAuthChanged = () => {
        syncUserFromStorage();
      };
      const handleStorage = (event) => {
        if (!event.key || event.key === 'shopCoreUser' || event.key === 'shopCoreToken') {
          syncUserFromStorage();
        }
      };
      window.addEventListener('auth:changed', handleAuthChanged);
      window.addEventListener('storage', handleStorage);
      const supabaseSubscription = USE_SUPABASE && supabase
        ? onAuthStateChange(() => syncUserFromStorage())
        : null;

      setLoading(false);

      return () => {
        window.removeEventListener('auth:changed', handleAuthChanged);
        window.removeEventListener('storage', handleStorage);
        supabaseSubscription?.data?.subscription?.unsubscribe?.();
      };
    };
    let cleanup = () => { };
    initAuth().then((dispose) => {
      cleanup = typeof dispose === 'function' ? dispose : () => { };
    });

    return () => {
      isMounted = false;
      cleanup();
    };
  }, []);

  const handleLogin = (userData, token) => {
    flushSync(() => setUser(userData));
    localStorage.setItem('shopCoreUser', JSON.stringify(userData));
    localStorage.setItem('shopCoreToken', token);
    window.dispatchEvent(new Event('auth:changed'));
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
    window.dispatchEvent(new Event('auth:changed'));
    // Navigation to /login handled by route guards (user is null)
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
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






