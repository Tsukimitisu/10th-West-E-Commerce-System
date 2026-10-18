import AdminTabs from '../../components/superadmin/AdminTabs';
﻿import React, { useEffect, useState } from 'react';
import {
  Shield, Lock, Key, Eye, EyeOff, Settings, Save, Loader2,
  CheckCircle2, AlertTriangle, Clock, Monitor, Globe, UserCog,
  XCircle, Activity, RefreshCw
} from 'lucide-react';
import {
  getSecuritySettings, updateSecuritySettings,
  getLoginAttempts, getSuspiciousActivity, getSystemHealth
} from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import ServiceHealth from '../../components/operations/ServiceHealth';
import SectionCard from '../../components/operations/SectionCard';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';

const SystemSecurityView = () => {
  const [health, setHealth] = useState(null);
  const [tab, setTab] = useState('lockout');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

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

  const [loginAttempts, setLoginAttempts] = useState([]);
  const [loginStats, setLoginStats] = useState({ today_total: 0, today_failed: 0, locked_accounts: 0 });
  const [suspicious, setSuspicious] = useState({ failed_login_clusters: [], locked_accounts: [], bulk_operations: [] });
  const [loginFilter, setLoginFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const [readiness, secSettings, loginData, suspiciousData] = await Promise.all([
          getSystemHealth().then(value => { setHealth(value); return value; }).catch(() => null),
          getSecuritySettings(),
          getLoginAttempts().catch(() => { setError('Login monitoring could not be loaded. Please retry.'); return { attempts: [], stats: {} }; }),
          getSuspiciousActivity().catch(() => { setError('Suspicious activity could not be loaded. Please retry.'); return { failed_login_clusters: [], locked_accounts: [], bulk_operations: [] }; }),
        ]);
        if (secSettings && typeof secSettings === 'object') {
          setConfig(prev => ({ ...prev, ...Object.fromEntries(Object.entries(secSettings).filter(([key]) => Object.hasOwn(prev, key))) }));
        }
        if (loginData?.attempts) setLoginAttempts(loginData.attempts);
        if (loginData?.stats) setLoginStats(loginData.stats);
        if (suspiciousData) setSuspicious(suspiciousData);
      } catch { setLoadFailed(true); setError('Security settings could not be loaded. Refresh before making changes.'); }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      setError('');
      await updateSecuritySettings(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (failure) { setError(failure.message || 'Security operation failed. Please retry.'); }
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
    } catch (failure) { setError(failure.message || 'Security operation failed. Please retry.'); }
  };

  const tabs = [
    { id: 'lockout', label: 'Account Lockout', icon: Lock },
    { id: 'password', label: 'Password Rules', icon: Key },
    { id: '2fa', label: 'Two-Factor Auth', icon: Shield },
    { id: 'monitor', label: 'Login Monitor', icon: Monitor },
    { id: 'readiness', label: 'OAuth & services', icon: Globe },
    { id: 'suspicious', label: 'Suspicious Activity', icon: AlertTriangle },
  ];

  const filteredAttempts = loginAttempts.filter(a => {
    if (loginFilter === 'failed') return !a.success;
    if (loginFilter === 'success') return a.success;
    return true;
  });

  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading security controls"><PageHeader title="Security controls" description="Loading authentication settings and recent activity…" />{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} className="h-16 w-full" />)}</div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security controls"
        description="Configure account lockout, password policy, two-factor enforcement, and authentication monitoring."
        actions={(tab === 'lockout' || tab === 'password' || tab === '2fa') && (
          <button onClick={handleSave} disabled={saving || loadFailed}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-500">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? 'Saved' : 'Save settings'}
          </button>
        )}
      />

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {['lockout','password','2fa'].includes(tab) && <p role="note" className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">Saved policies apply to authentication within 30 seconds. Session timeout is the maximum session lifetime; a shorter idle logout still applies. Required two-factor authentication guides users through setup or verification before granting system access. Existing account forms may apply stricter client checks when password rules are relaxed.</p>}
      {/* Tabs */}
      <AdminTabs label="Security category" items={tabs} value={tab} onChange={setTab}>

      {tab === 'readiness' && <SectionCard title="Authentication readiness" description="Reported provider configuration. No keys, tokens or credentials are displayed." padded={false}><ServiceHealth health={health} /></SectionCard>}
      {/* Account Lockout Policy */}
      {tab === 'lockout' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Lock size={16} className="text-gray-400" /> Account Lockout Policy</h3>
          <p className="text-xs text-gray-400">Configure how the system handles failed login attempts</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="security-max_login_attempts" className="text-xs text-gray-400 mb-2 block">Max Login Attempts</label>
              <input type="number" min="1" max="20" id="security-max_login_attempts" value={config.max_login_attempts} onChange={(e) => setConfig({ ...config, max_login_attempts: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
              <p className="text-[10px] text-gray-400 mt-1">Number of failed attempts before account is locked</p>
            </div>
            <div>
              <label htmlFor="security-lockout_duration_minutes" className="text-xs text-gray-400 mb-2 block">Lockout Duration (minutes)</label>
              <input type="number" min="1" max="1440" id="security-lockout_duration_minutes" value={config.lockout_duration_minutes} onChange={(e) => setConfig({ ...config, lockout_duration_minutes: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
              <p className="text-[10px] text-gray-400 mt-1">How long the account stays locked after reaching max attempts</p>
            </div>
            <div>
              <label htmlFor="security-session_timeout_minutes" className="text-xs text-gray-400 mb-2 block">Session Timeout (minutes)</label>
              <input type="number" min="5" max="10080" id="security-session_timeout_minutes" value={config.session_timeout_minutes} onChange={(e) => setConfig({ ...config, session_timeout_minutes: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
              <p className="text-[10px] text-gray-400 mt-1">Sessions cannot exceed this lifetime; shorter idle logout still applies</p>
            </div>
          </div>
        </div>
      )}

      {/* Password Rules */}
      {tab === 'password' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Key size={16} className="text-gray-400" /> Password Requirements</h3>
          <p className="text-xs text-gray-400">Set minimum password complexity requirements for all users</p>
          <div className="space-y-5">
            <div>
              <label htmlFor="security-password_min_length" className="text-xs text-gray-400 mb-2 block">Minimum Password Length</label>
              <input type="number" min="8" max="128" id="security-password_min_length" value={config.password_min_length} onChange={(e) => setConfig({ ...config, password_min_length: e.target.value })}
                className="w-48 px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            </div>
            {[
              { key: 'password_require_uppercase', label: 'Require uppercase letter (A-Z)' },
              { key: 'password_require_lowercase', label: 'Require lowercase letter (a-z)' },
              { key: 'password_require_number', label: 'Require number (0-9)' },
              { key: 'password_require_special', label: 'Require special character (!@#$...)' },
            ].map(rule => (
              <label key={rule.key} className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={config[rule.key] === 'true'} onChange={event => setConfig({ ...config, [rule.key]: event.target.checked ? 'true' : 'false' })} className="h-4 w-4 accent-orange-600" />
                <span className="text-sm text-gray-600 group-hover:text-white transition-colors">{rule.label}</span>
              </label>
            ))}
          </div>
          {/* Preview */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
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
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Shield size={16} className="text-gray-400" /> Two-Factor Authentication</h3>
          <p className="text-xs text-gray-400">Control whether 2FA is required for system users</p>
          <div className="space-y-3">
            {[
              { value: 'disabled', label: 'Disabled', desc: 'New enrollment is disabled; existing enrolled accounts still verify their codes' },
              { value: 'optional', label: 'Optional', desc: 'Users can enable 2FA from their profile' },
              { value: 'required', label: 'Required for Everyone', desc: 'All roles complete enrollment or verification before system access' },
            ].map(opt => (
              <label key={opt.value}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                  config['2fa_enforcement'] === opt.value ? 'border-orange-400 bg-orange-50' : 'border-gray-700 hover:border-gray-700 bg-gray-800'
                }`}
                >
                <input type="radio" name="system-2fa-policy" value={opt.value} checked={config['2fa_enforcement'] === opt.value} onChange={() => setConfig({ ...config, '2fa_enforcement': opt.value })} className="mt-1 h-4 w-4 shrink-0 accent-orange-600" />
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
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
          <div className="ops-inline-kpis">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Login Attempts (24h)</p>
              <p className="text-2xl font-bold text-white mt-1">{loginStats.today_total || 0}</p>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Failed Attempts (24h)</p>
              <p className={`text-2xl font-bold mt-1 ${(loginStats.today_failed || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>{loginStats.today_failed || 0}</p>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Locked Accounts</p>
              <p className={`text-2xl font-bold mt-1 ${(loginStats.locked_accounts || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>{loginStats.locked_accounts || 0}</p>
            </div>
          </div>

          {/* Attempt List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Login Attempts</h3>
              <div className="flex gap-2">
                <select value={loginFilter} onChange={(e) => setLoginFilter(e.target.value)}
                  className="px-2 py-1 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-600 focus:outline-none">
                  <option value="all">All</option>
                  <option value="success">Successful</option>
                  <option value="failed">Failed</option>
                </select>
                <button onClick={refreshLoginData} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><RefreshCw size={14} /></button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {filteredAttempts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No login attempts recorded</p>
              ) : filteredAttempts.slice(0, 50).map((a, idx) => (
                <div key={a.id || idx} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  {a.success ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" /> : <XCircle size={14} className="text-red-500 flex-shrink-0" />}
                  <span className="text-xs text-gray-700 flex-1 truncate">{a.email}</span>
                  <span className="text-[10px] text-gray-400 hidden sm:block">{a.ip_address}</span>
                  <span className="text-[10px] text-gray-400">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
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
            <button onClick={refreshLoginData} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-400 rounded-lg text-xs flex items-center gap-1"><RefreshCw size={12} /> Refresh</button>
          </div>

          {/* Failed Login Clusters */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Globe size={16} className="text-red-500" /> Failed Login Clusters
              <span className="ml-auto text-[10px] text-gray-400">(5+ failed attempts from same IP in 1 hour)</span>
            </h3>
            {(!suspicious.failed_login_clusters || suspicious.failed_login_clusters.length === 0) ? (
              <div className="flex items-center gap-2 py-4 justify-center text-green-500 text-xs">
                <CheckCircle2 size={14} /> No suspicious login clusters detected
              </div>
            ) : (
              <div className="space-y-2">
                {suspicious.failed_login_clusters.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{c.ip_address}</p>
                      <p className="text-[10px] text-gray-400">Targeted: {(c.targeted_emails || []).join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">{c.attempt_count} attempts</p>
                      <p className="text-[10px] text-gray-400">{c.last_attempt ? new Date(c.last_attempt).toLocaleString() : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Locked Accounts */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Lock size={16} className="text-red-500" /> Currently Locked Accounts</h3>
            {(!suspicious.locked_accounts || suspicious.locked_accounts.length === 0) ? (
              <div className="flex items-center gap-2 py-4 justify-center text-green-500 text-xs">
                <CheckCircle2 size={14} /> No accounts are currently locked
              </div>
            ) : (
              <div className="space-y-2">
                {suspicious.locked_accounts.map((a, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-red-500/10 border border-red-100 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{a.name}</p>
                      <p className="text-[10px] text-gray-400">{a.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-red-500">{a.login_attempts} failed attempts</p>
                      <p className="text-[10px] text-gray-400">Locked until: {a.locked_until ? new Date(a.locked_until).toLocaleString() : 'Indefinite'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bulk Operations */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Activity size={16} className="text-yellow-500" /> Unusual Bulk Operations</h3>
            {(!suspicious.bulk_operations || suspicious.bulk_operations.length === 0) ? (
              <div className="flex items-center gap-2 py-4 justify-center text-green-500 text-xs">
                <CheckCircle2 size={14} /> No unusual bulk operations detected
              </div>
            ) : (
              <div className="space-y-2">
                {suspicious.bulk_operations.map((b, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-yellow-50 border border-yellow-100 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{b.name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-400">Action: {b.action}</p>
                    </div>
                    <p className="text-sm font-bold text-yellow-600">{b.op_count} operations</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </AdminTabs>
    </div>
  );
};

export default SystemSecurityView;


