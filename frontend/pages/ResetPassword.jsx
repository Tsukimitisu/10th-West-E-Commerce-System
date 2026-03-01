import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, Check, X, Clock, ShieldAlert } from 'lucide-react';
import { resetPassword, verifyResetToken } from '../services/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(null);
  const [tokenChecking, setTokenChecking] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';

  // Validate token on mount — no email in URL (backend resolves from token)
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setTokenChecking(false);
      return;
    }
    const checkToken = async () => {
      try {
        await verifyResetToken(token);
        setTokenValid(true);
      } catch {
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

  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'One uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'One number', pass: /\d/.test(password) },
    { label: 'One special character', pass: /[!@#$%^&*()_\-+=]/.test(password) },
  ];
  const passwordStrength = checks.filter(c => c.pass).length;
  const strengthColor = passwordStrength <= 1 ? 'bg-orange-500' : passwordStrength <= 3 ? 'bg-amber-500' : 'bg-green-500';

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
    if (passwordStrength < 5) { setError('Password does not meet all requirements'); return; }

    setLoading(true);
    setError('');

    try {
      await resetPassword(token, password);
      setSuccess(true);
      setAttempts(0);
    } catch (err) {
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
        setError(err.message || `Failed to reset password. ${5 - newAttempts} attempt(s) remaining.`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Loading state while checking token
  if (tokenChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Lock size={24} className="text-orange-500" />
            </div>
            <p className="text-sm text-gray-500">Verifying reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  // Invalid or expired token
  if (tokenValid === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold font-display">10</span>
              </div>
            </Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={32} className="text-red-500" />
            </div>
            <h2 className="font-display font-semibold text-xl text-gray-900 mb-2">Link Expired or Invalid</h2>
            <p className="text-sm text-gray-500 mb-2">This password reset link is invalid or has expired.</p>
            <p className="text-xs text-gray-400 mb-6">Reset links expire after 1 hour for your security (RA 10173 §20).</p>
            <Link to="/forgot-password" className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">
              Request New Link
            </Link>
            <div className="mt-4">
              <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">Back to Sign In</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold font-display">10</span>
            </div>
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {success ? (
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h2 className="font-display font-semibold text-xl text-gray-900 mb-2">Password Reset!</h2>
              <p className="text-sm text-gray-500 mb-1">Your password has been successfully reset.</p>
              <p className="text-xs text-gray-400 mb-6">All other active sessions have been terminated for your security.</p>
              <Link to="/login" className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">
                Sign In with New Password
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock size={24} className="text-orange-500" />
                </div>
                <h2 className="font-display font-semibold text-xl text-gray-900 mb-1">Reset Password</h2>
                <p className="text-sm text-gray-500">Create a strong, unique password for your account.</p>
              </div>

              {isLocked && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                  <ShieldAlert size={16} />
                  <span>Too many attempts. Try again in {lockMinutes}:{String(lockSeconds).padStart(2, '0')}</span>
                </div>
              )}

              {error && !isLocked && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-600 flex items-center gap-2">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={isLocked}
                      autoComplete="new-password"
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full ${i <= passwordStrength ? strengthColor : 'bg-gray-200'}`} />
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      disabled={isLocked}
                      autoComplete="new-password"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-orange-500 mt-1">Passwords do not match</p>
                  )}
                </div>

                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Your password is encrypted using industry-standard bcrypt hashing. We never store plain-text passwords.
                    You cannot reuse your current password. This link expires after 1 hour.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || isLocked}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Resetting...' : isLocked ? 'Temporarily Locked' : 'Reset Password'}
                </button>
              </form>

              <div className="text-center mt-6">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
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
    </div>
  );
};

export default ResetPassword;
