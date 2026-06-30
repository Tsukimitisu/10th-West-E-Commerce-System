import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Shield, Check } from 'lucide-react';
import { login, API_ORIGIN, resendVerificationEmail } from '../services/api';
import BrandMark from '../components/ui/BrandMark';

const LOGIN_ERROR_MESSAGES = {
  access_denied: 'Google sign in was cancelled.',
  account_deactivated: 'This account is deactivated. Please contact support.',
  google_not_configured: 'Google sign in is not available right now.',
  google_failed: 'Google sign in failed. Please try again.',
  oauth_missing_email: 'Google did not return a verified email address. Please use another Google account or sign in with email.',
  oauth_failed: 'Authentication failed. Please try again.',
};

const getLoginErrorMessage = (error) => {
  const normalized = String(error || '').trim();
  return LOGIN_ERROR_MESSAGES[normalized] || normalized;
};

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendSuccess, setResendSuccess] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRedirect = searchParams.get('redirect') || '/';
  const pageMessage = searchParams.get('message') || '';
  const pageError = getLoginErrorMessage(searchParams.get('error'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setVerificationEmail('');
    setResendSuccess('');
    setLoading(true);
    try {
      const result = await login(email, password, needs2FA ? totpCode : undefined);
      if (result.requires_2fa) {
        setNeeds2FA(true);
        setLoading(false);
        return;
      }
      onLogin(result.user, result.token);
      // Role-based redirect: each role goes to their own dashboard
      const role = result.user?.role;
      let redirect = defaultRedirect;
      
      const additionalParams = new URLSearchParams(searchParams);
      additionalParams.delete('redirect');
      const paramString = additionalParams.toString();
      if (paramString) redirect += `?${paramString}`;

      if (role === 'super_admin') redirect = '/super-admin';
      else if (role === 'owner') redirect = '/admin';
      else if (role === 'admin') redirect = '/admin';
      else if (role === 'store_staff') redirect = '/admin';
      else if (role === 'cashier') redirect = '/pos';
      else if (defaultRedirect === '/') redirect = '/';
      navigate(redirect);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
      if (err.requiresVerification || err.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true);
        setVerificationEmail(err.email || email);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setLoading(true);
      setError('');
      setResendSuccess('');
      await resendVerificationEmail(verificationEmail || email);
      setResendSuccess('Verification email resent. Please check your inbox.');
    } catch (err) {
      setError(err.message || 'Failed to resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => {
    setError('');
    setResendSuccess('');
    setLoading(true);
    window.location.href = `${API_ORIGIN}/api/auth/${provider}`;
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#e53935] to-[#f97316]" aria-hidden="true" />
      <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-orange-100/60 blur-3xl" aria-hidden="true" />
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <BrandMark className="justify-center" />
          <h1 className="mt-6 font-display text-2xl font-bold text-slate-950">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to manage orders, addresses, and messages.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.09)] sm:p-8">
          {pageMessage && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-200 rounded-lg text-sm text-green-500 flex items-center gap-2">
              <Check size={16} /> {pageMessage}
            </div>
          )}

          {pageError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-500 flex items-center gap-2">
              <AlertCircle size={16} /> {pageError}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-500 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} /> <span>{error}</span>
              </div>
              {needsVerification && (
                <button 
                  onClick={handleResendVerification}
                  disabled={loading}
                  className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors self-start mt-1"
                >
                  Resend Verification Email
                </button>
              )}
            </div>
          )}

          {resendSuccess && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-200 rounded-lg text-sm text-green-500 flex items-center gap-2">
              <Check size={16} /> {resendSuccess}
            </div>
          )}

          {!needs2FA ? (
            <>
              {/* OAuth buttons */}
              <div className="space-y-2 mb-6">
                <button type="button" onClick={() => handleOAuth('google')} disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                <button type="button" onClick={() => handleOAuth('facebook')} disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Continue with Facebook
                </button>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-sm"><span className="bg-white px-3 text-slate-500">or sign in with email</span></div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="email" value={email} onChange={e => { setEmail(e.target.value); setNeedsVerification(false); setVerificationEmail(''); setResendSuccess(''); }} required placeholder="name@example.com"
                      className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-950 placeholder:text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">Password</label>
                    <Link to="/forgot-password" className="text-xs text-red-500 hover:text-orange-600">Forgot password?</Link>
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setNeedsVerification(false); setVerificationEmail(''); setResendSuccess(''); }} required placeholder="Enter your password"
                      className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-950 placeholder:text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm">
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Sign In <ArrowRight size={16} /></>}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={24} className="text-red-500" />
              </div>
              <h2 className="mb-1 font-display text-lg font-semibold text-slate-950">Two-factor authentication</h2>
              <p className="mb-6 text-sm text-slate-600">Enter the 6-digit code from your authenticator app.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))} maxLength={6}
                  placeholder="000000" autoFocus
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-950 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
                />
                <button type="submit" disabled={loading || totpCode.length !== 6}
                  className="w-full py-3 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors text-sm">
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button type="button" onClick={() => { setNeeds2FA(false); setTotpCode(''); }} className="text-sm text-gray-400 hover:text-gray-700">
                  Back to login
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Don't have an account? <Link to="/register" className="text-red-500 hover:text-orange-600 font-medium">Create one</Link>
        </p>
      </div>
    </main>
  );
};

export default Login;


