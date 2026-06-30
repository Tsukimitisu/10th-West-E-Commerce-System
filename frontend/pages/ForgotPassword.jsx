import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { forgotPassword } from '../services/api';
import BrandMark from '../components/ui/BrandMark';

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const EMAIL_VALIDATION_DEBOUNCE_MS = 650;

const mapForgotPasswordError = (err) => {
  const message = String(err?.message || '').trim().toLowerCase();
  const status = Number(err?.status || 0);

  if (status === 429 || message.includes('too many')) {
    return 'Too many reset requests. Please wait a few minutes before trying again.';
  }

  if (status === 400 || message.includes('invalid') || message.includes('email')) {
    return 'Please enter a valid email address and try again.';
  }

  if (message.includes('failed to fetch') || message.includes('network') || message.includes('load')) {
    return 'Unable to connect right now. Please check your internet connection and try again.';
  }

  return 'Unable to send a reset link right now. Please try again shortly.';
};

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailInteracted, setEmailInteracted] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateEmail = (value, mode = 'submit') => {
    const normalized = value.trim();

    if (!normalized) {
      return mode === 'submit' ? 'Enter your email address.' : '';
    }

    if (!EMAIL_REGEX.test(normalized)) {
      // Avoid noisy inline validation while the user is still starting to type.
      if (mode === 'live' && !/[.@]/.test(normalized)) return '';
      return 'Use a valid email format like name@example.com.';
    }

    return '';
  };

  useEffect(() => {
    if (!emailInteracted) return;

    const timer = setTimeout(() => {
      setEmailError(validateEmail(email, submitAttempted ? 'submit' : 'live'));
    }, EMAIL_VALIDATION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [email, emailInteracted, submitAttempted]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const nextEmailError = validateEmail(normalizedEmail, 'submit');

    setSubmitAttempted(true);
    setEmailInteracted(true);
    setEmailError(nextEmailError);
    setError('');

    if (nextEmailError) {
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(normalizedEmail);
      setEmail(normalizedEmail);
      setSent(true);
    } catch (err) {
      setError(mapForgotPasswordError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#e53935] to-[#f97316]" aria-hidden="true" />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BrandMark className="justify-center" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.09)]">
          {sent ? (
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h1 className="mb-2 font-display text-xl font-semibold text-slate-950">Check your email</h1>
              <p className="mb-6 text-sm leading-6 text-slate-600">If an account matches <strong>{email}</strong>, a password reset link has been sent. Check your inbox and spam folder, then follow the instructions in the email.</p>
              <Link to="/login" className="inline-flex items-center gap-2 text-sm text-red-500 hover:text-orange-600 font-medium">
                <ArrowLeft size={16} /> Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail size={24} className="text-red-500" />
                </div>
                <h1 className="mb-1 font-display text-xl font-semibold text-slate-950">Forgot your password?</h1>
                <p className="text-sm text-slate-600">Enter your email and we’ll send you a reset link.</p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-500 flex items-center gap-2">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailInteracted(true);
                        if (!submitAttempted) {
                          setEmailError('');
                        }
                        setError('');
                      }}
                      onBlur={() => {
                        setEmailInteracted(true);
                        setEmailError(validateEmail(email, 'submit'));
                      }}
                      placeholder="name@example.com"
                      aria-invalid={emailError ? 'true' : 'false'}
                      aria-describedby={emailError ? 'forgot-email-error' : undefined}
                      className={`w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                        emailError ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-orange-500'
                      }`}
                    />
                  </div>
                  {emailError && <p id="forgot-email-error" className="mt-1 text-xs text-red-500">{emailError}</p>}
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors text-sm">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div className="text-center mt-6">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950">
                  <ArrowLeft size={16} /> Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default ForgotPassword;
