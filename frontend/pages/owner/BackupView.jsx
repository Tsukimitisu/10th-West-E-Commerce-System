import React, { useState, useEffect } from 'react';
import { Database, Download, RefreshCw, Clock, CheckCircle2, AlertCircle, HardDrive, Server, Shield } from 'lucide-react';
import { createBackup, getBackupHistory } from '../../services/api';

const BackupView = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

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
    setMessage('');
    try {
      await createBackup();
      setMessage('Backup created successfully');
      const history = await getBackupHistory();
      setBackups(Array.isArray(history) ? history : []);
    } catch (err) {
      setMessage('Failed to create backup: ' + (err.message || 'Unknown error'));
    }
    setCreating(false);
  };

  const lastBackup = backups.length > 0 ? backups[0] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Database size={22} /> Backup & Recovery</h1>
          <p className="text-sm text-gray-500 mt-1">Manage database backups and system recovery</p>
        </div>
        <button onClick={handleCreateBackup} disabled={creating}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
          {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw size={16} />}
          {creating ? 'Creating Backup...' : 'Create Backup Now'}
        </button>
      </div>

      {/* Feedback Message */}
      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.includes('successfully') ? 'bg-green-50 border border-green-200 text-green-600' : 'bg-red-50 border border-red-200 text-red-600'}`}>
          {message.includes('successfully') ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <HardDrive size={18} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Backups</p>
              <p className="text-lg font-bold text-gray-900">{backups.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <Clock size={18} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Last Backup</p>
              <p className="text-sm font-semibold text-gray-900">
                {lastBackup ? new Date(lastBackup.created_at).toLocaleString() : 'No backups yet'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              {lastBackup ? (
                <p className="text-sm font-semibold text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={14} /> Healthy
                </p>
              ) : (
                <p className="text-sm font-semibold text-gray-400 flex items-center gap-1">
                  <AlertCircle size={14} /> No backups
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Backup History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Clock size={16} /> Backup History</h2>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : backups.length === 0 ? (
          <div className="p-12 text-center">
            <Database size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">No backups found</h3>
            <p className="text-sm text-gray-500">Create your first backup to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">ID</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">File Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Initiated By</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(backup => (
                  <tr key={backup.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-600">#{backup.id}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{backup.type || 'Full'}</td>
                    <td className="px-5 py-3 text-sm text-gray-900 font-medium">{backup.file_name || 'N/A'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        backup.status === 'completed' ? 'bg-green-50 text-green-600' :
                        backup.status === 'pending' ? 'bg-yellow-50 text-yellow-600' :
                        backup.status === 'failed' ? 'bg-red-50 text-red-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {backup.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {backup.created_at ? new Date(backup.created_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{backup.initiated_by || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Information */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4"><Server size={16} /> System Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center">
              <Database size={16} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Database</p>
              <p className="text-sm font-medium text-gray-900">PostgreSQL (Supabase)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center">
              <HardDrive size={16} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Current Version</p>
              <p className="text-sm font-medium text-gray-900">1.0.0</p>
            </div>
          </div>
        </div>
        <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-lg">
          <p className="text-xs text-orange-700 flex items-center gap-1.5">
            <Shield size={14} className="flex-shrink-0" />
            Backups are stored securely and can be used to restore the system to a previous state.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BackupView;
