import { usePasswordPolicy } from '../hooks/usePasswordPolicy.js';
import { passwordChecks, passwordPolicyError } from '../utils/passwordPolicy.js';
import BrandMark from '../components/ui/BrandMark';
﻿import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, Check, X, Clock, ShieldAlert } from 'lucide-react';
import { resetPassword, verifyResetToken } from '../services/api';

const ResetPassword = () => {
  const { policy, refreshPolicy } = usePasswordPolicy();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(null);
  const [tokenChecking, setTokenChecking] = useState(true);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const navigate = useNavigate();

  const location = useLocation();
  const token = searchParams.get('token') || location.state?.resetToken || '';

  // Validate token on mount — no email in URL (backend resolves from token)
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setTokenChecking(false);
      return;
    }
    const checkToken = async () => {
      try {
        const verification = await verifyResetToken(token);
        setTokenInfo(verification);
        setTokenValid(true);
      } catch (err) {
        setTokenInfo(null);
        setError(
          err.code === 'RESET_TOKEN_EXPIRED' || err.message?.toLowerCase().includes('expired')
            ? 'This reset link has expired. Please request a new one.'
            : 'This reset link is invalid. Please request a new one.'
        );
        setTokenValid(false);
      } finally {
        setTokenChecking(false);
      }
    };
    checkToken();

    // Security: clear token from browser history (RA 10173 §20)
    if (window.history.replaceState) {
      window.history.replaceState(null, '', '/#/reset-password');
    }
  }, [token]);

  // Rate limiting: lock after 5 failed attempts for 15 minutes
  useEffect(() => {
    if (lockedUntil && Date.now() < lockedUntil) {
      const timer = setInterval(() => {
        if (Date.now() >= lockedUntil) {
          setLockedUntil(null);
          setAttempts(0);
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockedUntil]);

  const checks = passwordChecks(password, policy);
  const passwordStrength = checks.filter(check => check.pass).length;
  const strengthColor = passwordStrength === checks.length ? 'bg-green-500' : passwordStrength <= checks.length / 2 ? 'bg-orange-500' : 'bg-amber-500';

  const isLocked = lockedUntil && Date.now() < lockedUntil;
  const lockRemainingSeconds = isLocked ? Math.ceil((lockedUntil - Date.now()) / 1000) : 0;
  const lockMinutes = Math.floor(lockRemainingSeconds / 60);
  const lockSeconds = lockRemainingSeconds % 60;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLocked) {
      setError(`Too many attempts. Try again in ${lockMinutes}m ${lockSeconds}s.`);
      return;
    }

    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    setError('');

    try {
      const policyError = passwordPolicyError(password, await refreshPolicy());
      if (policyError) { setError(policyError); return; }
      await resetPassword(token, password);
      setSuccess(true);
      setAttempts(0);
    } catch (err) {
      if (err.message?.startsWith('Password must')) { setError(err.message); void refreshPolicy(); return; }
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= 5) {
        const lockTime = Date.now() + 15 * 60 * 1000;
        setLockedUntil(lockTime);
        setError('Too many failed attempts. Temporarily locked for 15 minutes.');
      } else if (err.message?.includes('reuse') || err.message?.includes('previous') || err.message?.includes('same')) {
        setError('Cannot reuse your current password. Please choose a different one.');
      } else if (err.message?.includes('expired') || err.message?.includes('invalid')) {
        setError('This reset link has expired. Please request a new one.');
        setTokenValid(false);
      } else {
        setError(`Password reset could not be completed. ${5 - newAttempts} attempt(s) remaining.`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Loading state while checking token
  if (tokenChecking) {
    return (
      <div className="auth-page">
        <div className="auth-content">
          <BrandMark link={false} className="mb-6 w-full justify-center" />
          <div className="auth-form-body">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Lock size={24} className="text-red-500" />
            </div>
            <p className="text-sm text-gray-400">Verifying reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  // Invalid or expired token
  if (tokenValid === false) {
    return (
      <div className="auth-page">
        <div className="auth-content">
          <div className="auth-header">
            <BrandMark compact className="justify-center" />
          </div>
          <div className="auth-form-body">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock size={32} className="text-red-500" />
              </div>
              <h1 className="font-display font-semibold text-xl text-slate-950 mb-2">Link expired or invalid</h1>
              <p className="text-sm text-slate-600 mb-2">{error || 'This password reset link is invalid or has expired.'}</p>
              <p className="text-xs text-gray-400 mb-6">Reset links expire after 1 hour for your security (RA 10173 §20).</p>
            <Link to="/forgot-password" className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium rounded-lg transition-colors">
              Request New Link
            </Link>
            <div className="mt-4">
              <Link to="/login" className="text-sm text-gray-400 hover:text-gray-700">Back to Sign In</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-content">
        <div className="auth-header">
          <BrandMark compact className="justify-center" />
        </div>

        <div className="auth-form-body">
          {success ? (
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h1 className="font-display font-semibold text-xl text-slate-950 mb-2">Password reset</h1>
              <p className="text-sm text-slate-600 mb-1">Your password has been successfully reset.</p>
              <p className="text-xs text-gray-400 mb-6">All other active sessions have been terminated for your security.</p>
              <Link to="/login" className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium rounded-lg transition-colors">
                Sign In with New Password
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock size={24} className="text-red-500" />
                </div>
                <h1 className="font-display font-semibold text-xl text-slate-950 mb-1">Reset password</h1>
                <p className="text-sm text-slate-600">Create a strong, unique password for your account.</p>
                {tokenInfo?.email && (
                  <p className="mt-2 text-xs text-gray-400">Resetting password for <span className="font-medium text-gray-300">{tokenInfo.email}</span></p>
                )}
              </div>

              {isLocked && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                  <ShieldAlert size={16} />
                  <span>Too many attempts. Try again in {lockMinutes}:{String(lockSeconds).padStart(2, '0')}</span>
                </div>
              )}

              {error && !isLocked && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-orange-700 flex items-center gap-2">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              {attempts > 0 && attempts < 5 && !isLocked && (
                <div className="mb-4 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-600 text-center">
                  {5 - attempts} attempt{5 - attempts !== 1 ? 's' : ''} remaining before temporary lockout
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={isLocked}
                      autoComplete="new-password"
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-2">
                        {checks.map((check, index) => (
                          <div key={check.key} className={`h-1 flex-1 rounded-full ${index < passwordStrength ? strengthColor : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {checks.map((c, i) => (
                          <span key={i} className={`text-[11px] flex items-center gap-1 ${c.pass ? 'text-green-600' : 'text-gray-400'}`}>
                            {c.pass ? <Check size={10} /> : <X size={10} />} {c.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="reset-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        required
                        disabled={isLocked}
                        autoComplete="new-password"
                        className="w-full pl-10 pr-10 py-2.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                  </div>
                </div>

                <div className="auth-info-dark bg-gray-900 border border-gray-700 rounded-lg p-3">
                  <p className="text-sm leading-relaxed">
                    Your password is protected using bcrypt hashing. We never store plain-text passwords.
                    You cannot reuse your current password. Use this one-time reset before its displayed expiry.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || isLocked}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Resetting...' : isLocked ? 'Temporarily Locked' : 'Reset Password'}
                </button>
              </form>

              <div className="text-center mt-6">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700">
                  <ArrowLeft size={16} /> Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4">
          Protected under RA 10173 (Data Privacy Act of 2012). Your personal data is processed securely.
        </p>
      </div>
    </main>
  );
};

export default ResetPassword;


