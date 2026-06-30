import React, { lazy, Suspense, useState, useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import PrivacyBanner from './components/PrivacyBanner';
import EmailVerificationBanner from './components/EmailVerificationBanner';
import { getProfile, logoutApi, initializeSecurityContext } from './services/api.js';
import {
  clearCurrentAuthUser,
  clearLegacyAuthStorage,
  getCurrentAuthUser,
  setCurrentAuthUser,
  subscribeAuthRefresh,
} from './services/authSession.js';
import { SocketProvider } from './context/SocketContext.jsx';
import { Role } from './types.js';
import AppErrorBoundary from './components/AppErrorBoundary';

const AUTH_VERIFIED_STORAGE_KEY = 'auth_verified';

const Home = lazy(() => import('./pages/Home'));
const ProductList = lazy(() => import('./pages/ProductList'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Contact = lazy(() => import('./pages/Support/Contact'));
const FAQ = lazy(() => import('./pages/Support/FAQ'));
const PrivacyPolicy = lazy(() => import('./pages/Support/PolicyPrivacy'));
const TermsOfService = lazy(() => import('./pages/Support/TermsOfService'));
const ReturnPolicy = lazy(() => import('./pages/Support/ReturnPolicy'));
const Cart = lazy(() => import('./pages/customer/Cart'));
const Checkout = lazy(() => import('./pages/customer/Checkout'));
const OrderConfirmation = lazy(() => import('./pages/customer/OrderConfirmation'));
const PaymentResult = lazy(() => import('./pages/customer/PaymentResult'));
const Profile = lazy(() => import('./pages/customer/Profile'));
const OrderHistory = lazy(() => import('./pages/customer/OrderHistory'));
const OrderDetail = lazy(() => import('./pages/customer/OrderDetail'));
const RequestReturn = lazy(() => import('./pages/customer/RequestReturn'));
const MyReturns = lazy(() => import('./pages/customer/MyReturns'));
const AddressBook = lazy(() => import('./pages/customer/AddressBook'));
const Wishlist = lazy(() => import('./pages/customer/Wishlist'));
const Messages = lazy(() => import('./pages/customer/Messages'));
const AdminDashboard = lazy(() => import('./pages/owner/AdminDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/SuperAdminDashboard'));
const PosTerminal = lazy(() => import('./pages/staff/PosTerminal'));
const NotFound = lazy(() => import('./pages/NotFound'));

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center bg-slate-50" role="status" aria-label="Loading page">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-red-600" />
  </div>
);

const AppLayout = ({ user, onLogout, onLogin }) => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const hideChrome = location.pathname === '/pos' || ['/admin', '/staff', '/superadmin', '/super-admin'].some((path) => location.pathname.startsWith(path));
  const isAccountRoute = (
    location.pathname === '/profile' ||
    location.pathname === '/orders' ||
    location.pathname.startsWith('/orders/') ||
    location.pathname === '/my-returns' ||
    location.pathname === '/addresses' ||
    location.pathname === '/wishlist' ||
    location.pathname === '/messages'
  );

  // Super Admin can ONLY access /super-admin — redirect everything else
  if (isSuperAdmin && !location.pathname.startsWith('/superadmin') && !location.pathname.startsWith('/super-admin') && location.pathname !== '/login') {
    return <Navigate to="/superadmin/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      {!hideChrome && !isSuperAdmin && <Navbar user={user} onLogout={onLogout} />}
      {!hideChrome && !isSuperAdmin && user && <EmailVerificationBanner user={user} />}
      <div className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${location.pathname}${location.search}`}
            initial={shouldReduceMotion || isAccountRoute ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion || isAccountRoute ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: shouldReduceMotion || isAccountRoute ? 0 : 0.2, ease: 'easeOut' }}
            className="h-full bg-slate-50"
          >
            <AppErrorBoundary resetKey={`${location.pathname}${location.search}`}>
              <Suspense fallback={<RouteFallback />}>
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<ProductList />} />
                <Route path="/login" element={
                  user && user.role === Role.STORE_STAFF
                    ? <Navigate to="/staff/dashboard" replace />
                    : user && (user.role === Role.OWNER || user.role === Role.ADMIN)
                      ? <Navigate to="/admin/dashboard" replace />
                    : user && user.role === Role.SUPER_ADMIN
                      ? <Navigate to="/superadmin/dashboard" replace />
                      : user
                        ? <Navigate to="/" replace />
                        : <Login onLogin={onLogin} />
                } />
                <Route path="/register" element={
                  user && user.role === Role.STORE_STAFF
                    ? <Navigate to="/staff/dashboard" replace />
                    : user && (user.role === Role.OWNER || user.role === Role.ADMIN)
                      ? <Navigate to="/admin/dashboard" replace />
                    : user && user.role === Role.SUPER_ADMIN
                      ? <Navigate to="/superadmin/dashboard" replace />
                      : user
                        ? <Navigate to="/" replace />
                        : <Register onLogin={onLogin} />
                } />
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
                <Route path="/payment-result" element={user ? <PaymentResult /> : <Navigate to="/login" />} />
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
                <Route path="/messages" element={user ? <Messages /> : <Navigate to="/login?redirect=/messages" />} />
                <Route path="/admin/*" element={user?.role === Role.OWNER || user?.role === Role.ADMIN ? <AdminDashboard user={user} onLogout={onLogout} /> : <Navigate to="/login" replace />} />
                <Route path="/staff/*" element={user?.role === Role.STORE_STAFF ? <AdminDashboard user={user} onLogout={onLogout} /> : <Navigate to="/login" replace />} />
                <Route path="/superadmin/*" element={user?.role === Role.SUPER_ADMIN ? <SuperAdminDashboard user={user} /> : <Navigate to="/login" replace />} />
                <Route path="/super-admin/*" element={<Navigate to="/superadmin/dashboard" replace />} />
                <Route path="/pos" element={[Role.OWNER, Role.ADMIN, Role.STORE_STAFF, Role.CASHIER].includes(user?.role) ? <PosTerminal /> : <Navigate to="/login" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </AppErrorBoundary>
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
    let crossTabSyncTimer = null;

    const clearSession = () => {
      clearCurrentAuthUser({ broadcast: false });
      if (isMounted) setUser(null);
    };

    const applyProfile = (profile, { broadcast = false } = {}) => {
      if (!profile?.id) {
        clearSession();
        return;
      }
      setCurrentAuthUser(profile, { broadcast });
      if (isMounted) setUser(profile);
    };

    const syncUserWithProfileRefresh = async () => {
      try {
        const profile = await getProfile();
        applyProfile(profile);
      } catch {
        clearSession();
      }
    };

    const scheduleCrossTabAuthRefresh = () => {
      if (crossTabSyncTimer) {
        window.clearTimeout(crossTabSyncTimer);
      }

      crossTabSyncTimer = window.setTimeout(() => {
        crossTabSyncTimer = null;
        void syncUserWithProfileRefresh();
      }, 50);
    };

    // Check for existing session
    const initAuth = async () => {
      clearLegacyAuthStorage();
      await syncUserWithProfileRefresh();

      const handleAuthChanged = () => {
        if (isMounted) setUser(getCurrentAuthUser());
      };

      const handleAuthVerified = () => {
        void syncUserWithProfileRefresh();
      };

      const handleStorage = async (event) => {
        if (!event.key) {
          scheduleCrossTabAuthRefresh();
          return;
        }

        if (event.key === AUTH_VERIFIED_STORAGE_KEY && event.newValue === 'true') {
          await syncUserWithProfileRefresh();

          try {
            localStorage.removeItem(AUTH_VERIFIED_STORAGE_KEY);
          } catch {
            // Ignore cleanup failures for the one-shot cross-tab signal.
          }
        }
      };

      window.addEventListener('auth:changed', handleAuthChanged);
      window.addEventListener('auth:verified', handleAuthVerified);
      window.addEventListener('storage', handleStorage);
      const unsubscribeAuthRefresh = subscribeAuthRefresh(scheduleCrossTabAuthRefresh);

      setLoading(false);

      return () => {
        if (crossTabSyncTimer) {
          window.clearTimeout(crossTabSyncTimer);
          crossTabSyncTimer = null;
        }
        window.removeEventListener('auth:changed', handleAuthChanged);
        window.removeEventListener('auth:verified', handleAuthVerified);
        window.removeEventListener('storage', handleStorage);
        unsubscribeAuthRefresh();
      };
    };
    let cleanup = () => { };
    initAuth().then((dispose) => {
      cleanup = typeof dispose === 'function' ? dispose : () => { };
    });

    return () => {
      isMounted = false;
      if (crossTabSyncTimer) {
        window.clearTimeout(crossTabSyncTimer);
        crossTabSyncTimer = null;
      }
      cleanup();
    };
  }, []);

  const handleLogin = (userData) => {
    flushSync(() => setUser(userData));
    setCurrentAuthUser(userData);
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (e) {
      // Ignore logout errors
    }
    setUser(null);
    clearCurrentAuthUser();
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






