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
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Database size={22} className="text-red-400" /> Backup & Recovery</h1>
          <p className="text-sm text-gray-500 mt-1">Manage database backups and system recovery</p>
        </div>
        <button onClick={handleCreateBackup} disabled={creating}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Database size={16} />}
          {creating ? 'Creating Backup...' : 'Create Backup Now'}
        </button>
      </div>

      {/* Toast */}
      {message.text && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
          message.type === 'success' ? 'bg-green-900/30 text-green-400 border-green-700/30' : 'bg-red-900/30 text-red-400 border-red-700/30'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-500/10 rounded-lg"><Archive size={18} className="text-blue-400" /></div>
            <span className="text-xs text-gray-500">Total Backups</span>
          </div>
          <p className="text-2xl font-bold text-white">{backups.length}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-500/10 rounded-lg"><Clock size={18} className="text-green-400" /></div>
            <span className="text-xs text-gray-500">Last Backup</span>
          </div>
          <p className="text-lg font-bold text-white">
            {lastBackup ? new Date(lastBackup.created_at).toLocaleDateString() : 'Never'}
          </p>
          {lastBackupAge !== null && (
            <p className={`text-xs mt-1 ${lastBackupAge > 168 ? 'text-red-400' : lastBackupAge > 24 ? 'text-orange-400' : 'text-green-400'}`}>
              {lastBackupAge < 1 ? 'Less than an hour ago' : `${lastBackupAge} hours ago`}
            </p>
          )}
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-500/10 rounded-lg"><Server size={18} className="text-purple-400" /></div>
            <span className="text-xs text-gray-500">Backup Status</span>
          </div>
          <p className={`text-lg font-bold ${!lastBackup ? 'text-orange-400' : lastBackupAge > 168 ? 'text-red-400' : 'text-green-400'}`}>
            {!lastBackup ? 'No Backups' : lastBackupAge > 168 ? 'Overdue' : 'Up to Date'}
          </p>
        </div>
      </div>

      {/* Table Counts (shown after a backup) */}
      {tableCounts && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><HardDrive size={16} className="text-gray-500" /> Latest Backup Contents</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(tableCounts).map(([table, count]) => (
              <div key={table} className="bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-500 capitalize">{table.replace(/_/g, ' ')}</p>
                <p className="text-sm font-bold text-white">{count} rows</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup History */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><FileText size={16} className="text-gray-500" /> Backup History</h3>
          <button onClick={loadBackups} className="text-gray-500 hover:text-white"><RefreshCw size={14} /></button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="text-red-400 animate-spin" /></div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Database size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No backups yet</p>
            <p className="text-xs text-gray-600 mt-1">Create your first backup to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-800/30 transition-colors">
                <div className={`p-2 rounded-lg ${backup.status === 'completed' ? 'bg-green-500/10' : backup.status === 'failed' ? 'bg-red-500/10' : 'bg-orange-500/10'}`}>
                  {backup.status === 'completed' ? <CheckCircle2 size={16} className="text-green-400" /> :
                    backup.status === 'failed' ? <AlertCircle size={16} className="text-red-400" /> :
                    <Clock size={16} className="text-orange-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{backup.file_name || `Backup #${backup.id}`}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-gray-500 flex items-center gap-1"><User size={10} /> {backup.initiated_by_name || 'System'}</span>
                    <span className="text-[10px] text-gray-500 flex items-center gap-1"><Calendar size={10} /> {new Date(backup.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  backup.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                  backup.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                  'bg-orange-500/10 text-orange-400 border-orange-500/30'
                }`}>{backup.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recovery Info */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Shield size={16} className="text-gray-500" /> Recovery Information</h3>
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <p className="text-xs text-gray-400">For full database restoration, access the Supabase Dashboard directly:</p>
          <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
            <li>Visit your Supabase project dashboard</li>
            <li>Navigate to <span className="text-gray-300">Database → Backups</span></li>
            <li>Select the desired backup point to restore</li>
            <li>Supabase automatically manages Point-in-Time Recovery (PITR)</li>
          </ol>
          <p className="text-[10px] text-gray-600 mt-2">Note: In-app backups record table snapshots. Full database recovery is handled by Supabase infrastructure.</p>
        </div>
      </div>
    </div>
  );
};

export default BackupRecoveryView;
