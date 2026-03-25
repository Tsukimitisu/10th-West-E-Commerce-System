const fs = require('fs');
const file = 'frontend/pages/Register.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace import to include resendVerificationEmail
content = content.replace(
  /import { register, sendRegistrationOtp, API_ORIGIN } from '\.\.\/services\/api';/,
  import { register, resendVerificationEmail, API_ORIGIN } from '../services/api';
);

// Add missing modal state
content = content.replace(
  /const \[success, setSuccess\] = useState\(''\);/,
  const [success, setSuccess] = useState('');\n  const [showVerificationModal, setShowVerificationModal] = useState(false);\n  const [resending, setResending] = useState(false);\n  const [resendStatus, setResendStatus] = useState('');
);

// Modify handleSubmit
const oldSubmit =       if (result?.requiresVerification) {
        setSuccess(result.message || 'Registration successful. Please verify your email before signing in.');
        setPassword('');
        setConfirmPassword('');
        setAgreeTerms(false);
        setAgeConfirmed(false);
        const additionalParams = new URLSearchParams(searchParams);
        additionalParams.delete('redirect');
        const paramString = additionalParams.toString();
        
        let loginUrl = '/login';
        if (defaultRedirect !== '/') {
          loginUrl += \\\?redirect=\\\\\\;
          if (paramString) loginUrl += \\\&\\\\\\;
        }
        setTimeout(() => navigate(loginUrl), 2000);
        return;
      };
const newSubmit =       if (result?.requiresVerification) {
        setShowVerificationModal(true);
        // Do not redirect to login, wait for email verification
        return;
      };

content = content.replace(oldSubmit, newSubmit);

// Optional: add handleResend method before eturn (
const handleResend = 
  const handleResend = async () => {
    setResending(true);
    setResendStatus('');
    try {
      await resendVerificationEmail(email);
      setResendStatus('Verification email resent successfully! Please check your inbox.');
    } catch (err) {
      setResendStatus(err.message || 'Failed to resend verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
;
content = content.replace(/  return \(/, handleResend);

// Find the end of the return statement to append the Modal
// Let's insert it right before the last closing div of the page.
const modalCode = 
      {/* Verification Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl p-8 max-w-md w-full text-center relative">
            <div className="w-16 h-16 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Account created successfully.</h2>
            <p className="text-gray-300 mb-6">
              Please verify your email to continue. We have sent a verification link to <strong>{email}</strong>.
            </p>
            
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-400">
                <strong>Instructions:</strong> Check your Gmail inbox (and spam folder) for the verification email.
                Click the confirmation link to activate your account.
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
              <p className={\	ext-sm \\}>
                {resendStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
;

content = content.replace(/    <\/div>\n  \);\n};\n\nexport default Register;/, modalCode + "\nexport default Register;");

fs.writeFileSync(file, content, 'utf8');
