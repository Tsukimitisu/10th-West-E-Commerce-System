import React, { useEffect, useState } from 'react';
import {
  Activity, FileText, AlertTriangle, Search, RefreshCw,
  Loader2, CheckCircle2, XCircle, Filter, Download,
  Clock, Globe, User, Server, Database
} from 'lucide-react';
import {
  getActivityLogs, getErrorLogs, getTransactionLogs, getSuspiciousActivity
} from '../../services/api';

const MonitoringView = () => {
  const [tab, setTab] = useState('activity');
  const [loading, setLoading] = useState(true);
  const [activityLogs, setActivityLogs] = useState([]);
  const [errorLogs, setErrorLogs] = useState([]);
  const [transactionLogs, setTransactionLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [activity, errors, transactions] = await Promise.all([
        getActivityLogs().catch(() => []),
        getErrorLogs().catch(() => []),
        getTransactionLogs().catch(() => []),
      ]);
      setActivityLogs(Array.isArray(activity) ? activity : []);
      setErrorLogs(Array.isArray(errors) ? errors : []);
      setTransactionLogs(Array.isArray(transactions) ? transactions : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const tabs = [
    { id: 'activity', label: 'Activity Logs', icon: Activity, count: activityLogs.length },
    { id: 'errors', label: 'Error Logs', icon: AlertTriangle, count: errorLogs.length },
    { id: 'transactions', label: 'Transaction Logs', icon: FileText, count: transactionLogs.length },
  ];

  const filterLogs = (logs) => {
    if (!searchQuery) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(l =>
      (l.action || '').toLowerCase().includes(q) ||
      (l.user_name || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.message || '').toLowerCase().includes(q) ||
      (l.error_type || '').toLowerCase().includes(q) ||
      (l.endpoint || '').toLowerCase().includes(q) ||
      (l.ip_address || '').toLowerCase().includes(q)
    );
  };

  const formatAction = (action) => (action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const timeAgo = (date) => {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getActionColor = (action) => {
    if (!action) return 'text-gray-400';
    if (action.includes('delete') || action.includes('lock') || action.includes('reject')) return 'text-red-400';
    if (action.includes('create') || action.includes('add') || action.includes('approve') || action.includes('unlock')) return 'text-green-400';
    if (action.includes('update') || action.includes('edit') || action.includes('change') || action.includes('reset')) return 'text-blue-400';
    if (action.includes('login') || action.includes('logout')) return 'text-purple-400';
    if (action.includes('order') || action.includes('checkout') || action.includes('payment')) return 'text-orange-400';
    return 'text-gray-400';
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="text-red-400 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Activity size={22} className="text-red-400" /> Monitoring & Logs</h1>
          <p className="text-sm text-gray-500 mt-1">View system activity, error logs, and transaction history</p>
        </div>
        <button onClick={loadData} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg"><Activity size={18} className="text-blue-400" /></div>
          <div><p className="text-xs text-gray-500">Activity Logs</p><p className="text-lg font-bold text-white">{activityLogs.length}</p></div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle size={18} className="text-red-400" /></div>
          <div><p className="text-xs text-gray-500">Error Logs</p><p className="text-lg font-bold text-white">{errorLogs.length}</p></div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-lg"><FileText size={18} className="text-orange-400" /></div>
          <div><p className="text-xs text-gray-500">Transaction Logs</p><p className="text-lg font-bold text-white">{transactionLogs.length}</p></div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-gray-900 p-1 rounded-xl flex-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  tab === t.id ? 'bg-red-600/20 text-red-400' : 'text-gray-500 hover:text-white hover:bg-gray-800'
                }`}>
                <Icon size={14} /> {t.label}
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${tab === t.id ? 'bg-red-600/30 text-red-300' : 'bg-gray-800 text-gray-500'}`}>{t.count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" placeholder="Search logs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 w-full sm:w-56" />
        </div>
      </div>

      {/* Activity Logs */}
      {tab === 'activity' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="max-h-[520px] overflow-y-auto">
            {filterLogs(activityLogs).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Activity size={36} className="mb-3 opacity-30" />
                <p className="text-sm">No activity logs found</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-800/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400">Action</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden md:table-cell">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">IP Address</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">Details</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filterLogs(activityLogs).map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${getActionColor(log.action)}`}>{formatAction(log.action)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{log.user_name || 'System'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell font-mono">{log.ip_address || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell max-w-xs truncate">
                        {log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)).slice(0, 60) : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 text-right whitespace-nowrap">{timeAgo(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Error Logs */}
      {tab === 'errors' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="max-h-[520px] overflow-y-auto">
            {filterLogs(errorLogs).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-green-400">
                <CheckCircle2 size={36} className="mb-3 opacity-50" />
                <p className="text-sm">No errors logged</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-800/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400">Message</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden md:table-cell">Endpoint</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filterLogs(errorLogs).map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-[10px] font-bold">{log.error_type || 'Error'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300 max-w-xs truncate">{log.message}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell font-mono">{log.endpoint || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">{log.user_name || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 text-right whitespace-nowrap">{timeAgo(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Transaction Logs */}
      {tab === 'transactions' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="max-h-[520px] overflow-y-auto">
            {filterLogs(transactionLogs).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <FileText size={36} className="mb-3 opacity-30" />
                <p className="text-sm">No transaction logs found</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-800/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400">Action</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden md:table-cell">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 hidden lg:table-cell">Details</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filterLogs(transactionLogs).map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${getActionColor(log.action)}`}>{formatAction(log.action)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{log.user_name || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell max-w-xs truncate">
                        {log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)).slice(0, 60) : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 text-right whitespace-nowrap">{timeAgo(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitoringView;
