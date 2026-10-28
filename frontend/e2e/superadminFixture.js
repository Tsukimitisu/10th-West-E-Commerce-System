import { staffFixture } from './staffPhaseFixture.js';

export async function superadminFixture(page, options = {}) {
  const base = await staffFixture(page, { ...options, user: { role: 'super_admin', name: 'System Operator' } });
  const state = {
    settings: { store: { name: '10th West Moto', currency: 'PHP', timezone: 'Asia/Manila' }, security: { max_login_attempts: '5', password_min_length: '8', '2fa_enforcement': 'optional' }, system: { maintenance_mode: 'false' } },
    backups: [
      { id: '00000000-0000-4000-8000-000000000002', filename: 'latest.dump.enc', created_at: '2026-10-18T02:00:00Z', started_at: '2026-10-18T02:00:00Z', completed_at: '2026-10-18T02:00:10Z', status: 'completed', backup_type: 'automatic', size_bytes: 1024, encrypted: true, checksum: 'a'.repeat(64), created_by_name: 'System' },
      { id: '00000000-0000-4000-8000-000000000001', filename: 'older.dump.enc', created_at: '2026-10-17T02:00:00Z', started_at: '2026-10-17T02:00:00Z', completed_at: '2026-10-17T02:00:10Z', status: 'completed', backup_type: 'manual', size_bytes: 1024, encrypted: true, checksum: 'b'.repeat(64), created_by_name: 'System Operator' },
    ],
    active: null, failSave: false, failBackup: false, failRequest: false, writes: [], base,
  };
  await page.route('**/api/admin/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/admin', '');
    const method = request.method();
    const reply = (json, status = 200) => route.fulfill({ json, status });
    if (method !== 'GET') state.writes.push({ path, method, body: request.postData() });
    if (path === '/backups/status') return reply({ configured: true, automatic_enabled: true, scheduler_status: 'healthy', next_automatic_backup: '2026-10-19T18:00:00Z', timezone: 'Asia/Manila', storage: 'private', encrypted: true, retention_days: 30, active: state.active, last_success: state.backups.find(row => row.status === 'completed' && !row.deleted_at), last_failure: state.backups.find(row => row.status === 'failed') });
    if (path === '/backups' && method === 'GET') return reply(state.backups);
    if (path === '/backups' && method === 'POST') {
      if (state.failRequest) return reply({ message: 'Backup already in progress.' }, 409);
      const row = { ...state.backups[0], id: crypto.randomUUID(), backup_type: 'manual', status: 'queued', created_by_name: 'System Operator', created_at: new Date().toISOString(), completed_at: null };
      state.backups.unshift(row); state.active = row;
      setTimeout(() => { row.status = state.failBackup ? 'failed' : 'completed'; row.completed_at = new Date().toISOString(); row.error_summary = state.failBackup ? 'Backup failed. Check system logs.' : null; state.active = null; }, 400);
      return reply({ backup: row }, 202);
    }
    if (path.startsWith('/backups/') && method === 'DELETE') { state.backups.find(row => row.id === path.split('/')[2]).deleted_at = new Date().toISOString(); return reply({ message: 'Backup deleted.' }); }
    if (path.endsWith('/download')) return reply({ url: 'https://downloads.example.test/backup.enc', filename: 'private.dump.enc', expires_in: 60, encrypted: true });
    if (path === '/security/settings' && method === 'GET') return reply(state.settings.security);
    if (path === '/security/settings' && method === 'PUT') {
      if (state.failSave) return reply({ message: 'Settings could not be saved.' }, 500);
      const settings = request.postDataJSON().settings;
      if (settings.settings) return reply({ message: 'Unsupported setting: security.settings' }, 400);
      if (Number(settings.password_min_length) < 8) return reply({ message: 'Invalid password length.' }, 400);
      Object.assign(state.settings.security, settings); return reply({ message: 'Security settings updated' });
    }
    if (path.startsWith('/settings') && method === 'GET') {
      const category = path.split('/')[2];
      return reply(Object.entries(state.settings).flatMap(([group, values]) => (!category || category === group) ? Object.entries(values).map(([key, value]) => ({ category: group, key, value })) : []));
    }
    if (path === '/settings' && method === 'PUT') {
      if (state.failSave) return reply({ message: 'Settings could not be saved.' }, 500);
      const { category, settings } = request.postDataJSON();
      if (category === 'shipping' && Number(settings.flat_rate) < 0) return reply({ message: 'Invalid value.' }, 400);
      state.settings[category] = settings; return reply({ message: 'Settings saved' });
    }
    if (path === '/users') return reply({ users: [], total: 0 });
    if (path === '/security/login-attempts') return reply({ attempts: [], stats: {} });
    if (path === '/logs/suspicious') return reply({ failed_login_clusters: [], locked_accounts: [], bulk_operations: [] });
    if (path.includes('/logs/')) return reply([]);
    if (path === '/health' || path === '/readiness') return reply({ database: { status: 'ok' }, integrations: {} });
    return reply([]);
  });
  await page.route('https://downloads.example.test/**', route => route.fulfill({ body: 'isolated-encrypted-artifact', headers: { 'Content-Disposition': 'attachment; filename="private.dump.enc"', 'Content-Type': 'application/octet-stream' } }));
  return state;
}
