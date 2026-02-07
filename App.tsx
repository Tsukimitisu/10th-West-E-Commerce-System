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
import { User, Role } from './types';
import { logoutApi } from './services/api';
import { SocketProvider } from './context/SocketContext';

const AppLayout: React.FC<{ user: User | null; onLogout: () => void; onLogin: (userData: User, token: string) => void }> = ({ user, onLogout, onLogin }) => {
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

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('shopCoreUser');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleLogin = (userData: User, token: string) => {
    setUser(userData);
    localStorage.setItem('shopCoreUser', JSON.stringify(userData));
    localStorage.setItem('shopCoreToken', token);
  };

  const handleLogout = () => {
    logoutApi().catch(() => {});
    setUser(null);
    localStorage.removeItem('shopCoreUser');
    localStorage.removeItem('shopCoreToken');
  };

  return (
    <SocketProvider>
      <Router>
        <AppLayout user={user} onLogout={handleLogout} onLogin={handleLogin} />
      </Router>
    </SocketProvider>
  );
};

export default App;
