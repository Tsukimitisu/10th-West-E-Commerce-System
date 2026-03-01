import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, X } from 'lucide-react';

const PrivacyBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', JSON.stringify({
      accepted: true,
      timestamp: new Date().toISOString(),
      version: '1.0',
    }));
    setVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', JSON.stringify({
      accepted: false,
      timestamp: new Date().toISOString(),
      version: '1.0',
    }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] px-4 pb-4 animate-slide-up">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield size={20} className="text-orange-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-semibold text-gray-900 mb-1">We Value Your Privacy</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-1">
              We use cookies and similar technologies to enhance your browsing experience, analyze site traffic, and personalize content.
              By clicking "Accept All", you consent to the use of cookies in accordance with our{' '}
              <Link to="/privacy" className="text-orange-500 hover:underline font-medium">Privacy Policy</Link> and the
              Philippine Data Privacy Act of 2012 (RA 10173).
            </p>
            <p className="text-xs text-gray-400">
              You can change your preferences at any time. Essential cookies required for site functionality cannot be disabled.
            </p>
          </div>
          <button onClick={handleDecline} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button onClick={handleDecline}
            className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Essential Only
          </button>
          <button onClick={handleAccept}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyBanner;
