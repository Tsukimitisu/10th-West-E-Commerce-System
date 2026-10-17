import React, { useState, useEffect } from 'react';
import {
  Database, Download, RefreshCw, Clock, CheckCircle2,
  AlertCircle, HardDrive, Server, Shield, Loader2,
  FileText, Calendar, User, Archive
} from 'lucide-react';
import { createBackup, getBackupHistory } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';

const BackupRecoveryView = () => {
  const backupProviderConfigured = false;
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
      <PageHeader
        title="Backup & recovery"
        description="Review legacy backup metadata. Recoverable in-app backups are not configured."
        actions={<button onClick={handleCreateBackup} disabled={creating || !backupProviderConfigured}
          title="Real backup provider is not configured"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-500">
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Database size={16} />}
          {creating ? 'Creating backup…' : 'Backup not configured'}
        </button>}
      />

      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">In-app records below are metadata only. Verify recoverable backups and retention in Supabase before a recovery plan depends on them.</div>

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
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Archive size={18} className="text-blue-500" /></div>
            <span className="text-xs text-gray-400">Legacy metadata records</span>
          </div>
          <p className="text-2xl font-bold text-white">{backups.length}</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-50 rounded-lg"><Clock size={18} className="text-green-500" /></div>
            <span className="text-xs text-gray-400">Last Backup</span>
          </div>
          <p className="text-lg font-bold text-white">
            {lastBackup ? new Date(lastBackup.created_at).toLocaleDateString() : 'Never'}
          </p>
          {lastBackupAge !== null && (
            <p className={`text-xs mt-1 ${lastBackupAge > 168 ? 'text-red-500' : lastBackupAge > 24 ? 'text-red-500' : 'text-green-500'}`}>
              {lastBackupAge < 1 ? 'Less than an hour ago' : `${lastBackupAge} hours ago`}
            </p>
          )}
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-slate-100 rounded-lg"><Server size={18} className="text-slate-700" /></div>
            <span className="text-xs text-gray-400">Backup provider</span>
          </div>
          <p className="text-lg font-bold text-red-500">
            Not configured
          </p>
        </div>
      </div>

      {/* Table Counts (shown after a backup) */}
      {tableCounts && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><HardDrive size={16} className="text-gray-400" /> Latest Backup Contents</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(tableCounts).map(([table, count]) => (
              <div key={table} className="bg-gray-900 rounded-lg px-3 py-2 border border-gray-700">
                <p className="text-[10px] text-gray-400 capitalize">{table.replace(/_/g, ' ')}</p>
                <p className="text-sm font-bold text-white">{count} rows</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup History */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><FileText size={16} className="text-gray-400" /> Backup History</h3>
          <button onClick={loadBackups} aria-label="Refresh backup history" className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"><RefreshCw size={16} /></button>
        </div>
        {loading ? (
          <div className="space-y-3 p-4" role="status" aria-label="Loading backup history">{Array.from({ length: 3 }, (_, index) => <LoadingSkeleton key={index} className="h-14 w-full" />)}</div>
        ) : backups.length === 0 ? (
          <div className="p-6"><EmptyState icon={Database} title="No backup metadata" description="Recoverable in-app backups are not configured. Check your Supabase backup plan directly." /></div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className={`p-2 rounded-lg ${backup.status === 'completed' ? 'bg-green-50' : backup.status === 'failed' ? 'bg-red-50' : 'bg-red-500/10'}`}>
                  {backup.status === 'completed' ? <CheckCircle2 size={16} className="text-green-500" /> :
                    backup.status === 'failed' ? <AlertCircle size={16} className="text-red-500" /> :
                    <Clock size={16} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{backup.file_name || `Backup #${backup.id}`}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-gray-400 flex items-center gap-1"><User size={10} /> {backup.initiated_by_name || 'System'}</span>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1"><Calendar size={10} /> {new Date(backup.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  backup.status === 'completed' ? 'bg-green-50 text-green-600 border-green-200' :
                  backup.status === 'failed' ? 'bg-red-50 text-red-600 border-red-200' :
                  'bg-orange-50 text-orange-800 border-red-200'
                }`}>{backup.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recovery Info */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Shield size={16} className="text-gray-400" /> Recovery Information</h3>
        <div className="bg-gray-900 rounded-lg p-4 space-y-2 border border-gray-700">
          <p className="text-xs text-gray-400">For full database restoration, access the Supabase Dashboard directly:</p>
          <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
            <li>Visit your Supabase project dashboard</li>
            <li>Navigate to <span className="text-gray-700 font-medium">Database → Backups</span></li>
            <li>Follow the hosting provider’s recovery process in an isolated environment first</li>
            <li>Confirm backup retention and Point-in-Time Recovery availability for the current plan</li>
          </ol>
          <p className="text-xs text-red-700 mt-2">The records above are metadata only and are not recoverable backup files. Verify Supabase backup/PITR availability directly before production.</p>
        </div>
      </div>
    </div>
  );
};

export default BackupRecoveryView;


