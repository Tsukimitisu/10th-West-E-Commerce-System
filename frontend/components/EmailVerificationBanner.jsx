import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertTriangle, CheckCircle2, Send } from 'lucide-react';

const EmailVerificationBanner = () => {
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    try {
      const userData = localStorage.getItem('shopCoreUser');
      if (userData) {
        const user = JSON.parse(userData);
        // Show banner if user is logged in but email is not verified
        if (user && user.id && !user.email_verified) {
          setVisible(true);
        }
      }
    } catch {}
  }, []);

  const handleResend = async () => {
    setSending(true);
    try {
      const token = localStorage.getItem('shopCoreToken');
      const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      await fetch(`${API}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      setSent(true);
    } catch {}
    setSending(false);
  };

  if (!visible) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-700">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>
            Please verify your email address to access all features.
            {sent && <span className="text-green-600 font-medium ml-2"><CheckCircle2 size={14} className="inline" /> Verification email sent!</span>}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!sent && (
            <button onClick={handleResend} disabled={sending}
              className="px-3 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-1">
              {sending ? 'Sending...' : <><Send size={12} /> Resend Email</>}
            </button>
          )}
          <button onClick={() => setVisible(false)} className="text-amber-500 hover:text-amber-700 text-xs font-medium">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationBanner;
