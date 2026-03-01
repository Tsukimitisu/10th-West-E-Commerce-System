import React, { useState, useEffect } from 'react';
import {
  Database, Download, RefreshCw, Clock, CheckCircle2,
  AlertCircle, HardDrive, Server, Shield, Loader2,
  FileText, Calendar, User, Archive
} from 'lucide-react';
import { createBackup, getBackupHistory } from '../../services/api';

const BackupRecoveryView = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [tableCounts, setTableCounts] = useState(null);

  useEffect(() => { loadBackups(); }, []);

  const loadBackups = async () => {
    try {
      const data = await getBackupHistory();
      setBackups(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    setMessage({ type: '', text: '' });
    try {
      const result = await createBackup();
      setMessage({ type: 'success', text: 'Backup created successfully' });
      if (result?.table_counts) setTableCounts(result.table_counts);
      await loadBackups();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed: ' + (err.message || 'Unknown error') });
    }
    setCreating(false);
  };

  const lastBackup = backups.length > 0 ? backups[0] : null;
  const lastBackupAge = lastBackup ? Math.floor((Date.now() - new Date(lastBackup.created_at).getTime()) / (1000 * 60 * 60)) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Database size={22} className="text-orange-500" /> Backup & Recovery</h1>
          <p className="text-sm text-gray-500 mt-1">Manage database backups and system recovery</p>
        </div>
        <button onClick={handleCreateBackup} disabled={creating}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm">
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Database size={16} />}
          {creating ? 'Creating Backup...' : 'Create Backup Now'}
        </button>
      </div>

      {/* Toast */}
      {message.text && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Archive size={18} className="text-blue-500" /></div>
            <span className="text-xs text-gray-500">Total Backups</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{backups.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-50 rounded-lg"><Clock size={18} className="text-green-500" /></div>
            <span className="text-xs text-gray-500">Last Backup</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {lastBackup ? new Date(lastBackup.created_at).toLocaleDateString() : 'Never'}
          </p>
          {lastBackupAge !== null && (
            <p className={`text-xs mt-1 ${lastBackupAge > 168 ? 'text-red-500' : lastBackupAge > 24 ? 'text-orange-500' : 'text-green-500'}`}>
              {lastBackupAge < 1 ? 'Less than an hour ago' : `${lastBackupAge} hours ago`}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 rounded-lg"><Server size={18} className="text-purple-500" /></div>
            <span className="text-xs text-gray-500">Backup Status</span>
          </div>
          <p className={`text-lg font-bold ${!lastBackup ? 'text-orange-500' : lastBackupAge > 168 ? 'text-red-500' : 'text-green-500'}`}>
            {!lastBackup ? 'No Backups' : lastBackupAge > 168 ? 'Overdue' : 'Up to Date'}
          </p>
        </div>
      </div>

      {/* Table Counts (shown after a backup) */}
      {tableCounts && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><HardDrive size={16} className="text-gray-400" /> Latest Backup Contents</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(tableCounts).map(([table, count]) => (
              <div key={table} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                <p className="text-[10px] text-gray-500 capitalize">{table.replace(/_/g, ' ')}</p>
                <p className="text-sm font-bold text-gray-900">{count} rows</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup History */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><FileText size={16} className="text-gray-400" /> Backup History</h3>
          <button onClick={loadBackups} className="text-gray-400 hover:text-gray-700"><RefreshCw size={14} /></button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="text-orange-500 animate-spin" /></div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Database size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No backups yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first backup to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className={`p-2 rounded-lg ${backup.status === 'completed' ? 'bg-green-50' : backup.status === 'failed' ? 'bg-red-50' : 'bg-orange-50'}`}>
                  {backup.status === 'completed' ? <CheckCircle2 size={16} className="text-green-500" /> :
                    backup.status === 'failed' ? <AlertCircle size={16} className="text-red-500" /> :
                    <Clock size={16} className="text-orange-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-medium truncate">{backup.file_name || `Backup #${backup.id}`}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-gray-400 flex items-center gap-1"><User size={10} /> {backup.initiated_by_name || 'System'}</span>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1"><Calendar size={10} /> {new Date(backup.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  backup.status === 'completed' ? 'bg-green-50 text-green-600 border-green-200' :
                  backup.status === 'failed' ? 'bg-red-50 text-red-600 border-red-200' :
                  'bg-orange-50 text-orange-600 border-orange-200'
                }`}>{backup.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recovery Info */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Shield size={16} className="text-gray-400" /> Recovery Information</h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-100">
          <p className="text-xs text-gray-500">For full database restoration, access the Supabase Dashboard directly:</p>
          <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
            <li>Visit your Supabase project dashboard</li>
            <li>Navigate to <span className="text-gray-700 font-medium">Database → Backups</span></li>
            <li>Select the desired backup point to restore</li>
            <li>Supabase automatically manages Point-in-Time Recovery (PITR)</li>
          </ol>
          <p className="text-[10px] text-gray-400 mt-2">Note: In-app backups record table snapshots. Full database recovery is handled by Supabase infrastructure.</p>
        </div>
      </div>
    </div>
  );
};

export default BackupRecoveryView;
