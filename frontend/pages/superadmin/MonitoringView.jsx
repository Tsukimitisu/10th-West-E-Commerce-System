import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { getActivityLogs, getErrorLogs, getTransactionLogs, getSystemHealth } from '../../services/api';
import PageHeader from '../../components/operations/PageHeader';
import SectionCard from '../../components/operations/SectionCard';
import ServiceHealth from '../../components/operations/ServiceHealth';
import DataToolbar, { FilterSelect, MobileDataCard } from '../../components/operations/DataToolbar';
import StatusBadge from '../../components/ui/StatusBadge';
import { Pagination } from '../../components/ui/BrandPrimitives';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';

const humanize = value => String(value || '').replaceAll('_', ' ');
const resultOf = log => log.result || log.status || (typeof log.success === 'boolean' ? log.success ? 'success' : 'failed' : 'Not recorded');
const entityOf = log => log.entity_type || log.entity || log.resource_type || log.table_name || '';
const entityIdOf = log => log.entity_id ?? log.resource_id ?? log.record_id ?? '';
const detailText = value => {
  if (!value) return '';
  if (typeof value === 'string') { try { return detailText(JSON.parse(value)); } catch { return value; } }
  if (typeof value !== 'object') return String(value);
  return Object.entries(value).map(([key, item]) => `${humanize(key)}: ${typeof item === 'object' ? JSON.stringify(item) : item}`).join(' · ');
};
const logTime = value => value ? new Date(value).toLocaleString('en-PH') : 'Not recorded';

export default function MonitoringView({ initialTab = 'activity', title = 'Monitoring & logs' }) {
  const isAudit = title === 'Audit trail';
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ activity: [], errors: [], transactions: [], health: null });
  const [error, setError] = useState('');
  const [activityPaging, setActivityPaging] = useState({ page: 1, total: 0, busy: false });
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ actor: '', action: '', entity: '', result: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const loadData = async () => {
    setLoading(true);
    const results = await Promise.allSettled([getActivityLogs({ limit: 100 }), getErrorLogs(), getTransactionLogs(), ...(!isAudit ? [getSystemHealth()] : [])]);
    const value = (index, fallback) => results[index]?.status === 'fulfilled' ? results[index].value : fallback;
    const asRows = value => Array.isArray(value) ? value : Array.isArray(value?.logs) ? value.logs : [];
    const activityResponse = value(0, []);
    setActivityPaging({ page: 1, total: Number(activityResponse?.total || asRows(activityResponse).length), busy: false });
    setData({ activity: asRows(value(0, [])), errors: asRows(value(1, [])), transactions: asRows(value(2, [])), health: value(3, null) });
    setError(results.some(item => item.status === 'rejected') ? 'Some records could not be loaded. Refresh before relying on this view.' : '');
    setLoading(false);
  };
  useEffect(() => { loadData(); }, []);
  const loadMoreActivity = async () => {
    setActivityPaging(current => ({ ...current, busy: true }));
    try {
      const next = await getActivityLogs({ limit: 100, page: activityPaging.page + 1 });
      const rows = Array.isArray(next) ? next : next?.logs || [];
      setData(current => ({ ...current, activity: [...new Map([...current.activity, ...rows].map(row => [row.id, row])).values()] }));
      setActivityPaging(current => ({ page: current.page + 1, total: Number(next?.total || current.total), busy: false }));
    } catch { setError('Older activity records could not be loaded. Try again.'); setActivityPaging(current => ({ ...current, busy: false })); }
  };
  const logs = data[tab] || [];
  const options = useMemo(() => ({
    actor: [...new Set(logs.map(log => log.user_name || log.email || 'System'))].sort(),
    action: [...new Set(logs.map(log => log.action || log.error_type || '').filter(Boolean))].sort(),
    entity: [...new Set(logs.map(entityOf).filter(Boolean))].sort(),
    result: [...new Set(logs.map(resultOf))].sort(),
  }), [logs]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return logs.filter(log => {
      const day = log.created_at ? new Date(log.created_at).toLocaleDateString('en-CA') : '';
      return (!term || [log.action, log.user_name, log.email, log.message, log.error_type, log.endpoint, log.ip_address, entityOf(log), entityIdOf(log), detailText(log.details)].some(value => String(value || '').toLowerCase().includes(term)))
        && (!filters.actor || (log.user_name || log.email || 'System') === filters.actor)
        && (!filters.action || (log.action || log.error_type) === filters.action)
        && (!filters.entity || entityOf(log) === filters.entity)
        && (!filters.result || resultOf(log) === filters.result)
        && (!filters.from || Boolean(day && day >= filters.from))
        && (!filters.to || Boolean(day && day <= filters.to));
    });
  }, [logs, query, filters]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  const rows = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const updateFilter = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const tabs = [['activity', 'Activity Logs'], ['errors', 'Error Logs'], ['transactions', 'Transaction Logs']];
  return <div className="space-y-5">
    <PageHeader title={title} description={isAudit ? 'Read-only records of platform actions and transaction events.' : 'Current service readiness and application diagnostics.'} actions={<button type="button" onClick={loadData} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</button>} />
    {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {!isAudit && <SectionCard title="System health" description={data.health?.timestamp ? `Last checked ${logTime(data.health.timestamp)} · readiness is configuration-level.` : 'Live readiness will appear when the request succeeds.'} padded={false}>{loading ? <LoadingSkeleton className="h-48 w-full" /> : <ServiceHealth health={data.health} />}</SectionCard>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
      <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto" role="group" aria-label="Log category">{tabs.map(([id, label]) => <button type="button" key={id} onClick={() => { setTab(id); setPage(1); setFilters({ actor: '', action: '', entity: '', result: '', from: '', to: '' }); }} aria-pressed={tab === id} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${tab === id ? 'border-orange-600 text-slate-950' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>{label} <span className="ml-1 text-xs font-normal">{data[id].length}</span></button>)}</div>
      <p className="ops-readonly-note pb-2"><ShieldCheck size={15} aria-hidden="true" />Read only</p>
    </div>
    <DataToolbar search={query} onSearchChange={event => { setQuery(event.target.value); setPage(1); }} searchPlaceholder="Search actor, action, entity or details…" label="Log filters">
      {['actor', 'action', 'entity', 'result'].map(key => <FilterSelect label={key[0].toUpperCase() + key.slice(1)} key={key} value={filters[key]} onChange={event => updateFilter(key, event.target.value)}><option value="">All {key === 'entity' ? 'entities' : `${key}s`}</option>{options[key].map(value => <option key={value} value={value}>{humanize(value)}</option>)}</FilterSelect>)}
      <label className="ops-filter-select"><span>From</span><input type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)} /></label>
      <label className="ops-filter-select"><span>To</span><input type="date" min={filters.from || undefined} value={filters.to} onChange={event => updateFilter('to', event.target.value)} /></label>
    </DataToolbar>
    <SectionCard title={tabs.find(([id]) => id === tab)?.[1]} description={`${filtered.length} matching records from the loaded log set. Missing fields remain “Not recorded”.`} padded={false}>
      {loading ? <div className="space-y-2 p-4" role="status" aria-label="Loading audit events">{Array.from({ length: 5 }, (_, index) => <LoadingSkeleton key={index} className="h-12 w-full" />)}</div> : !rows.length ? <p className="p-6 text-sm text-slate-600">No records match these filters.</p> : <>
        <div className="md:hidden">{rows.map((log, index) => <MobileDataCard key={log.id || index} title={humanize(log.action || log.error_type || 'System event')} reference={logTime(log.created_at)} status={<StatusBadge tone={tab === 'errors' ? 'danger' : 'neutral'}>{humanize(resultOf(log))}</StatusBadge>}><p className="mt-2 text-sm text-slate-600">{log.user_name || log.email || 'System'}</p><p className="mt-1 text-xs text-slate-600">{entityOf(log) || 'Entity not recorded'} {entityIdOf(log)}</p><details className="mt-2 text-xs"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Event details</summary><p className="ops-log-details">{log.message || detailText(log.details) || 'No additional details.'}</p>{log.ip_address && <p className="mt-2 font-mono">Source: {log.ip_address}</p>}</details></MobileDataCard>)}</div>
        <div tabIndex={0} role="region" aria-label="Audit log table" className="hidden max-h-[620px] overflow-auto md:block"><table className="ops-audit-table w-full text-left"><thead><tr>{['Timestamp', 'Actor', 'Action', 'Entity', 'Entity ID', 'Source', 'Result', 'Details'].map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((log, index) => <tr key={log.id || index}><td className="whitespace-nowrap text-xs">{logTime(log.created_at)}</td><td>{log.user_name || log.email || 'System'}</td><td className="font-medium">{humanize(log.action || log.error_type || 'System event')}</td><td>{entityOf(log) || 'Not recorded'}</td><td className="font-mono text-xs">{entityIdOf(log) || '—'}</td><td className="font-mono text-xs">{log.ip_address || log.source || 'Not recorded'}</td><td><StatusBadge tone={tab === 'errors' ? 'danger' : 'neutral'}>{humanize(resultOf(log))}</StatusBadge></td><td><details><summary className="cursor-pointer py-2 text-xs font-semibold">View details</summary><p className="ops-log-details">{log.message || detailText(log.details) || 'No additional details.'}</p>{log.endpoint && <p className="mt-2 font-mono text-xs">{log.endpoint}</p>}</details></td></tr>)}</tbody></table></div>
      </>}
      {tab === 'activity' && data.activity.length < activityPaging.total && <div className="border-t border-slate-200 px-4 py-3"><button type="button" disabled={activityPaging.busy} onClick={loadMoreActivity} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">{activityPaging.busy ? 'Loading older activity…' : `Load older activity (${data.activity.length} of ${activityPaging.total} loaded)`}</button></div>}
      <div className="px-4"><Pagination page={currentPage} totalPages={Math.max(1, Math.ceil(filtered.length / 20))} onChange={setPage} /></div>
    </SectionCard>
  </div>;
}
