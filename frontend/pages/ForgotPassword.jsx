import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { forgotPassword } from '../services/api';

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateEmail = (value) => {
    const normalized = value.trim();
    if (!normalized) return 'Enter your email address.';
    if (!EMAIL_REGEX.test(normalized)) return 'Enter a valid email address.';
    return '';
  };

  useEffect(() => {
    if (!emailTouched) return;

    const timer = setTimeout(() => {
      setEmailError(validateEmail(email));
    }, 450);

    return () => clearTimeout(timer);
  }, [email, emailTouched]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const nextEmailError = validateEmail(normalizedEmail);

    setEmailTouched(true);
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
      setError(
        err.message === 'Email not found'
          ? 'No account was found for that email address.'
          : (err.message || 'Unable to send a reset link right now.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-red-500/100 rounded-xl flex items-center justify-center"><span className="text-white font-bold font-display">10</span></div>
          </Link>
        </div>

        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-8">
          {sent ? (
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h2 className="font-display font-semibold text-xl text-white mb-2">Check Your Email</h2>
              <p className="text-sm text-gray-400 mb-6">If an account matches <strong>{email}</strong>, a password reset link has been sent. Check your inbox and spam folder, then follow the instructions in the email.</p>
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
                <h2 className="font-display font-semibold text-xl text-white mb-1">Forgot Password?</h2>
                <p className="text-sm text-gray-400">Enter your email and we'll send you a reset link.</p>
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
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailTouched(true);
                        setError('');
                      }}
                      onBlur={() => {
                        setEmailTouched(true);
                        setEmailError(validateEmail(email));
                      }}
                      placeholder="name@example.com"
                      aria-invalid={emailError ? 'true' : 'false'}
                      className={`w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                        emailError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-orange-500'
                      }`}
                    />
                  </div>
                  {emailError && <p className="mt-1 text-xs text-red-500">{emailError}</p>}
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors text-sm">
                  {loading ? 'Sending...' : 'Send Reset Link'}
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
      </div>
    </div>
  );
};

export default ForgotPassword;
