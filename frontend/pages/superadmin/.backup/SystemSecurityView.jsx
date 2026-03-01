import React, { useEffect, useState } from 'react';
import {
  Shield, Lock, Key, Eye, EyeOff, Settings, Save, Loader2,
  CheckCircle2, AlertTriangle, Clock, Monitor, Globe, UserCog,
  XCircle, Activity, RefreshCw
} from 'lucide-react';
import {
  getSecuritySettings, updateSecuritySettings,
  getLoginAttempts, getSuspiciousActivity
} from '../../services/api';

const SystemSecurityView = () => {
  const [tab, setTab] = useState('lockout');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Security Config
  const [config, setConfig] = useState({
    max_login_attempts: '5',
    lockout_duration_minutes: '15',
    password_min_length: '8',
    password_require_uppercase: 'true',
    password_require_lowercase: 'true',
    password_require_number: 'true',
    password_require_special: 'true',
    session_timeout_minutes: '30',
    '2fa_enforcement': 'optional',
  });

  // Login Monitor
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [loginStats, setLoginStats] = useState({ today_total: 0, today_failed: 0, locked_accounts: 0 });
  const [suspicious, setSuspicious] = useState({ failed_login_clusters: [], locked_accounts: [], bulk_operations: [] });
  const [loginFilter, setLoginFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const [secSettings, loginData, suspiciousData] = await Promise.all([
          getSecuritySettings().catch(() => ({})),
          getLoginAttempts().catch(() => ({ attempts: [], stats: {} })),
          getSuspiciousActivity().catch(() => ({ failed_login_clusters: [], locked_accounts: [], bulk_operations: [] })),
        ]);
        if (secSettings && typeof secSettings === 'object') {
          setConfig(prev => ({ ...prev, ...secSettings }));
        }
        if (loginData?.attempts) setLoginAttempts(loginData.attempts);
        if (loginData?.stats) setLoginStats(loginData.stats);
        if (suspiciousData) setSuspicious(suspiciousData);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSecuritySettings({ settings: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const refreshLoginData = async () => {
    try {
      const [loginData, suspiciousData] = await Promise.all([
        getLoginAttempts(),
        getSuspiciousActivity(),
      ]);
      if (loginData?.attempts) setLoginAttempts(loginData.attempts);
      if (loginData?.stats) setLoginStats(loginData.stats);
      if (suspiciousData) setSuspicious(suspiciousData);
    } catch (e) { console.error(e); }
  };

  const tabs = [
    { id: 'lockout', label: 'Account Lockout', icon: Lock },
    { id: 'password', label: 'Password Rules', icon: Key },
    { id: '2fa', label: 'Two-Factor Auth', icon: Shield },
    { id: 'monitor', label: 'Login Monitor', icon: Monitor },
    { id: 'suspicious', label: 'Suspicious Activity', icon: AlertTriangle },
  ];

  const filteredAttempts = loginAttempts.filter(a => {
    if (loginFilter === 'failed') return !a.success;
    if (loginFilter === 'success') return a.success;
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20"><Loader2 size={24} className="text-red-400 animate-spin" /></div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Shield size={22} className="text-red-400" /> System Security</h1>
          <p className="text-sm text-gray-500 mt-1">Configure lockout policies, password rules, and 2FA settings</p>
        </div>
        {(tab === 'lockout' || tab === 'password' || tab === '2fa') && (
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-red-600/20 text-red-400' : 'text-gray-500 hover:text-white hover:bg-gray-800'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Account Lockout Policy */}
      {tab === 'lockout' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Lock size={16} className="text-gray-500" /> Account Lockout Policy</h3>
          <p className="text-xs text-gray-500">Configure how the system handles failed login attempts</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Max Login Attempts</label>
              <input type="number" min="1" max="20" value={config.max_login_attempts} onChange={(e) => setConfig({ ...config, max_login_attempts: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30" />
              <p className="text-[10px] text-gray-600 mt-1">Number of failed attempts before account is locked</p>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Lockout Duration (minutes)</label>
              <input type="number" min="1" max="1440" value={config.lockout_duration_minutes} onChange={(e) => setConfig({ ...config, lockout_duration_minutes: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30" />
              <p className="text-[10px] text-gray-600 mt-1">How long the account stays locked after reaching max attempts</p>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Session Timeout (minutes)</label>
              <input type="number" min="5" max="480" value={config.session_timeout_minutes} onChange={(e) => setConfig({ ...config, session_timeout_minutes: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30" />
              <p className="text-[10px] text-gray-600 mt-1">Inactive sessions are automatically terminated</p>
            </div>
          </div>
        </div>
      )}

      {/* Password Rules */}
      {tab === 'password' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Key size={16} className="text-gray-500" /> Password Requirements</h3>
          <p className="text-xs text-gray-500">Set minimum password complexity requirements for all users</p>
          <div className="space-y-5">
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Minimum Password Length</label>
              <input type="number" min="6" max="32" value={config.password_min_length} onChange={(e) => setConfig({ ...config, password_min_length: e.target.value })}
                className="w-48 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30" />
            </div>
            {[
              { key: 'password_require_uppercase', label: 'Require uppercase letter (A-Z)' },
              { key: 'password_require_lowercase', label: 'Require lowercase letter (a-z)' },
              { key: 'password_require_number', label: 'Require number (0-9)' },
              { key: 'password_require_special', label: 'Require special character (!@#$...)' },
            ].map(rule => (
              <label key={rule.key} className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-10 h-5 rounded-full transition-colors relative ${config[rule.key] === 'true' ? 'bg-red-600' : 'bg-gray-700'}`}
                  onClick={() => setConfig({ ...config, [rule.key]: config[rule.key] === 'true' ? 'false' : 'true' })}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${config[rule.key] === 'true' ? 'left-5' : 'left-0.5'}`} />
                </div>
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{rule.label}</span>
              </label>
            ))}
          </div>
          {/* Preview */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-xs text-gray-400 mb-2">Password Policy Preview:</p>
            <p className="text-sm text-white">
              Minimum {config.password_min_length} characters
              {config.password_require_uppercase === 'true' && ', 1 uppercase'}
              {config.password_require_lowercase === 'true' && ', 1 lowercase'}
              {config.password_require_number === 'true' && ', 1 number'}
              {config.password_require_special === 'true' && ', 1 special character'}
            </p>
          </div>
        </div>
      )}

      {/* Two-Factor Authentication */}
      {tab === '2fa' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Shield size={16} className="text-gray-500" /> Two-Factor Authentication</h3>
          <p className="text-xs text-gray-500">Control whether 2FA is required for system users</p>
          <div className="space-y-3">
            {[
              { value: 'disabled', label: 'Disabled', desc: '2FA is not available for any user' },
              { value: 'optional', label: 'Optional', desc: 'Users can enable 2FA from their profile' },
              { value: 'required_staff', label: 'Required for Staff', desc: 'All staff roles must enable 2FA' },
              { value: 'required_all', label: 'Required for Everyone', desc: 'All users must set up 2FA to log in' },
            ].map(opt => (
              <label key={opt.value}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  config['2fa_enforcement'] === opt.value ? 'border-red-500/50 bg-red-500/5' : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                }`}
                onClick={() => setConfig({ ...config, '2fa_enforcement': opt.value })}>
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                  config['2fa_enforcement'] === opt.value ? 'border-red-500' : 'border-gray-600'
                }`}>
                  {config['2fa_enforcement'] === opt.value && <div className="w-2 h-2 bg-red-500 rounded-full" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Login Monitor */}
      {tab === 'monitor' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-xs text-gray-500">Login Attempts (24h)</p>
              <p className="text-2xl font-bold text-white mt-1">{loginStats.today_total || 0}</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-xs text-gray-500">Failed Attempts (24h)</p>
              <p className={`text-2xl font-bold mt-1 ${(loginStats.today_failed || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>{loginStats.today_failed || 0}</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-xs text-gray-500">Locked Accounts</p>
              <p className={`text-2xl font-bold mt-1 ${(loginStats.locked_accounts || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>{loginStats.locked_accounts || 0}</p>
            </div>
          </div>

          {/* Attempt List */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Login Attempts</h3>
              <div className="flex gap-2">
                <select value={loginFilter} onChange={(e) => setLoginFilter(e.target.value)}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 focus:outline-none">
                  <option value="all">All</option>
                  <option value="success">Successful</option>
                  <option value="failed">Failed</option>
                </select>
                <button onClick={refreshLoginData} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg"><RefreshCw size={14} /></button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {filteredAttempts.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-8">No login attempts recorded</p>
              ) : filteredAttempts.slice(0, 50).map((a, idx) => (
                <div key={a.id || idx} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                  {a.success ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" /> : <XCircle size={14} className="text-red-500 flex-shrink-0" />}
                  <span className="text-xs text-gray-300 flex-1 truncate">{a.email}</span>
                  <span className="text-[10px] text-gray-600 hidden sm:block">{a.ip_address}</span>
                  <span className="text-[10px] text-gray-600">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Suspicious Activity */}
      {tab === 'suspicious' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={refreshLoginData} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs flex items-center gap-1"><RefreshCw size={12} /> Refresh</button>
          </div>

          {/* Failed Login Clusters */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Globe size={16} className="text-red-400" /> Failed Login Clusters
              <span className="ml-auto text-[10px] text-gray-500">(5+ failed attempts from same IP in 1 hour)</span>
            </h3>
            {(!suspicious.failed_login_clusters || suspicious.failed_login_clusters.length === 0) ? (
              <div className="flex items-center gap-2 py-4 justify-center text-green-400 text-xs">
                <CheckCircle2 size={14} /> No suspicious login clusters detected
              </div>
            ) : (
              <div className="space-y-2">
                {suspicious.failed_login_clusters.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-red-900/10 border border-red-800/30 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{c.ip_address}</p>
                      <p className="text-[10px] text-gray-500">Targeted: {(c.targeted_emails || []).join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-400">{c.attempt_count} attempts</p>
                      <p className="text-[10px] text-gray-500">{c.last_attempt ? new Date(c.last_attempt).toLocaleString() : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Locked Accounts */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Lock size={16} className="text-orange-400" /> Currently Locked Accounts</h3>
            {(!suspicious.locked_accounts || suspicious.locked_accounts.length === 0) ? (
              <div className="flex items-center gap-2 py-4 justify-center text-green-400 text-xs">
                <CheckCircle2 size={14} /> No accounts are currently locked
              </div>
            ) : (
              <div className="space-y-2">
                {suspicious.locked_accounts.map((a, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-orange-900/10 border border-orange-800/30 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{a.name}</p>
                      <p className="text-[10px] text-gray-500">{a.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-orange-400">{a.login_attempts} failed attempts</p>
                      <p className="text-[10px] text-gray-500">Locked until: {a.locked_until ? new Date(a.locked_until).toLocaleString() : 'Indefinite'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bulk Operations */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Activity size={16} className="text-yellow-400" /> Unusual Bulk Operations</h3>
            {(!suspicious.bulk_operations || suspicious.bulk_operations.length === 0) ? (
              <div className="flex items-center gap-2 py-4 justify-center text-green-400 text-xs">
                <CheckCircle2 size={14} /> No unusual bulk operations detected
              </div>
            ) : (
              <div className="space-y-2">
                {suspicious.bulk_operations.map((b, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-yellow-900/10 border border-yellow-800/30 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{b.name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-500">Action: {b.action}</p>
                    </div>
                    <p className="text-sm font-bold text-yellow-400">{b.op_count} operations</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemSecurityView;
