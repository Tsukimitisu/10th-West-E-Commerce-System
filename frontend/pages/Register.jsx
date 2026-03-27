import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, Check, X } from 'lucide-react';
import { register, resendVerificationEmail, API_ORIGIN } from '../services/api';

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState('');

  const checks = [
    { key: 'length', label: 'At least 8 characters', pass: password.length >= 8 },
    { key: 'uppercase', label: 'One uppercase letter', pass: /[A-Z]/.test(password) },
    { key: 'lowercase', label: 'One lowercase letter', pass: /[a-z]/.test(password) },
    { key: 'number', label: 'One number', pass: /\d/.test(password) },
    { key: 'special', label: 'One special character (optional)', pass: /[!@#$%^&*()_\-+=]/.test(password), optional: true },
  ];

  const passwordStrength = checks.filter((check) => check.pass).length;
  const strengthColor = passwordStrength <= 2 ? 'bg-red-500/100' : passwordStrength <= 4 ? 'bg-amber-500' : 'bg-green-500';

  const getInputClassName = (field) =>
    `w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
      fieldErrors[field] ? 'border-red-500' : 'border-gray-700'
    }`;

  const clearFieldError = (field) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!name.trim()) nextErrors.name = 'Name is required.';
    else if (name.trim().length < 2) nextErrors.name = 'Name must be at least 2 characters.';

    if (!email.trim()) nextErrors.email = 'Email is required.';
    else if (!EMAIL_REGEX.test(email.trim())) nextErrors.email = 'Please enter a valid email address.';

    if (!password) nextErrors.password = 'Password is required.';
    else if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      nextErrors.password = 'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
    }

    if (!confirmPassword) nextErrors.confirmPassword = 'Please confirm your password.';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';

    if (!agreeTerms) nextErrors.consent_given = 'You must agree to the Terms of Service and Privacy Policy.';
    if (!ageConfirmed) nextErrors.age_confirmed = 'You must confirm you are at least 18 years old.';

    return nextErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResendStatus('');

    const nextErrors = validateForm();
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setError('Please correct the highlighted fields.');
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await register(
        name.trim(),
        normalizedEmail,
        password,
        confirmPassword,
        { consent_given: true, age_confirmed: true }
      );

      setFieldErrors({});
      setVerificationMessage(result?.message || 'Registration successful. Please check your email to verify your account.');
      setShowVerificationModal(true);
      setEmail(normalizedEmail);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      const nextFieldErrors = err.fieldErrors || {};
      setFieldErrors(nextFieldErrors);

      if (err.requiresVerification || err.code === 'VERIFICATION_EMAIL_FAILED') {
        setVerificationMessage(err.message || 'Please check your email to verify your account.');
        setShowVerificationModal(true);
        return;
      }

      if (Object.keys(nextFieldErrors).length > 0) {
        setError('Please correct the highlighted fields.');
        return;
      }

      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => {
    window.location.href = `${API_ORIGIN}/api/auth/${provider}`;
  };

  const handleResend = async () => {
    setResending(true);
    setResendStatus('');

    try {
      await resendVerificationEmail(email);
      setResendStatus('Verification email resent successfully. Please check your inbox.');
    } catch (err) {
      setResendStatus(err.message || 'Failed to resend verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-red-500/100 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold font-display">10</span>
            </div>
          </Link>
          <h1 className="font-display font-bold text-2xl text-white mt-4">Create Account</h1>
          <p className="text-sm text-gray-400 mt-1">Join 10th West Moto today</p>
        </div>

        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-500 flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="space-y-2 mb-6">
            <button onClick={() => handleOAuth('google')} className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-700 rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium text-gray-700">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <button onClick={() => handleOAuth('facebook')} className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-700 rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium text-gray-700">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Continue with Facebook
            </button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700" /></div>
            <div className="relative flex justify-center text-sm"><span className="px-3 bg-gray-800 text-gray-400">or register with email</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                  placeholder="John Doe"
                  className={getInputClassName('name')}
                />
              </div>
              {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                  placeholder="name@example.com"
                  className={getInputClassName('email')}
                />
              </div>
              {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                  placeholder="Create a strong password"
                  className={`${getInputClassName('password')} pr-10`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((item) => (
                      <div key={item} className={`h-1 flex-1 rounded-full transition-colors ${item <= passwordStrength ? strengthColor : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {checks.map((check) => (
                      <span key={check.key} className={`text-[11px] flex items-center gap-1 ${check.pass ? 'text-green-600' : 'text-gray-400'}`}>
                        {check.pass ? <Check size={10} /> : <X size={10} />} {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError('confirmPassword'); }}
                  placeholder="Confirm your password"
                  className={`${getInputClassName('confirmPassword')} pr-10`}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.confirmPassword && <p className="text-xs text-red-500 mt-1">{fieldErrors.confirmPassword}</p>}
            </div>

            <div className="space-y-3 p-4 bg-gray-900 rounded-xl border border-gray-700">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => { setAgreeTerms(e.target.checked); clearFieldError('consent_given'); }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-orange-500"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  I agree to the <Link to="/terms" className="text-red-500 hover:underline font-medium">Terms of Service</Link> and{' '}
                  <Link to="/privacy" className="text-red-500 hover:underline font-medium">Privacy Policy</Link>.
                  I consent to the collection and processing of my personal data as described in the Privacy Policy,
                  in accordance with RA 10173 (Data Privacy Act of 2012). <span className="text-red-500">*</span>
                </span>
              </label>
              {fieldErrors.consent_given && <p className="text-xs text-red-500">{fieldErrors.consent_given}</p>}

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => { setAgeConfirmed(e.target.checked); clearFieldError('age_confirmed'); }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-orange-500"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  I confirm that I am at least 18 years old or have parental/guardian consent. <span className="text-red-500">*</span>
                </span>
              </label>
              {fieldErrors.age_confirmed && <p className="text-xs text-red-500">{fieldErrors.age_confirmed}</p>}
            </div>

            <button type="submit" disabled={loading} className="w-full py-3 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Create Account <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-gray-400">
          Already have an account? <Link to="/login" className="text-red-500 hover:text-orange-600 font-medium">Sign in</Link>
        </p>
      </div>

      {showVerificationModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl p-8 max-w-md w-full text-center relative">
            <div className="w-16 h-16 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Registration successful</h2>
            <p className="text-gray-300 mb-6">
              {verificationMessage || 'Registration successful. Please check your email to verify your account.'}
            </p>

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-400">
                We sent a verification link to <strong>{email}</strong>. Check your inbox and spam folder, then open the link to activate your account.
              </p>
            </div>

            <button
              onClick={handleResend}
              disabled={resending}
              className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center mb-4"
            >
              {resending ? 'Sending...' : 'Resend Verification Email'}
            </button>

            {resendStatus && (
              <p className={`text-sm ${resendStatus.toLowerCase().includes('success') ? 'text-green-500' : 'text-red-500'}`}>
                {resendStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;
