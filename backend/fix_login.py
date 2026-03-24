import codecs
import re

with codecs.open('../frontend/pages/Login.jsx', 'r', 'utf-8') as f:
    text = f.read()

text = text.replace(
    "import { login, sendOtp, resetPassword, API_ORIGIN } from '../services/api';",
    "import { login, sendOtp, resetPassword, API_ORIGIN, resendVerificationEmail } from '../services/api';"
)

text = text.replace("const [loading, setLoading] = useState(false);", "const [loading, setLoading] = useState(false);\n  const [needsVerification, setNeedsVerification] = useState(false);\n  const [resendSuccess, setResendSuccess] = useState('');")

submit_old = '''const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
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
      else if (role === 'store_staff') redirect = '/admin';
      else if (defaultRedirect === '/') redirect = '/';
      navigate(redirect);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };'''

submit_new = '''const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResendSuccess('');
    setNeedsVerification(false);
    setLoading(true);
    try {
      const result = await login(email, password, needs2FA ? totpCode : undefined);
      if (result.requires_2fa) {
        setNeeds2FA(true);
        setLoading(false);
        return;
      }
      onLogin(result.user, result.token);
      const role = result.user?.role;
      let redirect = defaultRedirect;
      const additionalParams = new URLSearchParams(searchParams);
      additionalParams.delete('redirect');
      const paramString = additionalParams.toString();
      if (paramString) redirect += `?${paramString}`;
      if (role === 'super_admin') redirect = '/super-admin';
      else if (role === 'owner') redirect = '/admin';
      else if (role === 'store_staff') redirect = '/admin';
      else if (defaultRedirect === '/') redirect = '/';
      navigate(redirect);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
      if (err.message && err.message.includes('not yet verified')) {
        setNeedsVerification(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResendSuccess('');
      setError('');
      await resendVerificationEmail(email);
      setResendSuccess('Verification email resent. Please check your inbox.');
    } catch (err) {
      setError(err.message || 'Failed to resend verification email.');
    }
  };'''

text = text.replace(submit_old, submit_new)

error_render = '''{error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 text-sm">
              <AlertCircle size={18} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}'''

error_render_new = '''{error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 text-sm">
              <AlertCircle size={18} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
          {needsVerification && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex flex-col gap-2 text-amber-500 text-sm">
              <p>Your account is not verified.</p>
              <button 
                type="button"
                onClick={handleResend}
                className="self-start text-xs font-medium px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded transition-colors"
              >
                Resend Verification Email
              </button>
            </div>
          )}
          {resendSuccess && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3 text-green-500 text-sm">
              <p>{resendSuccess}</p>
            </div>
          )}'''

text = text.replace(error_render, error_render_new)

with codecs.open('../frontend/pages/Login.jsx', 'w', 'utf-8') as f:
    f.write(text)
