import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { getActivityLogs, getErrorLogs, getTransactionLogs, getSystemHealth } from '../../services/api';
import { getCurrentAuthUser } from '../../services/authSession';
import PageHeader from '../../components/operations/PageHeader';
import SectionCard from '../../components/operations/SectionCard';
import ServiceHealth from '../../components/operations/ServiceHealth';
import DataToolbar, { FilterSelect, MobileDataCard } from '../../components/operations/DataToolbar';
import StatusBadge from '../../components/ui/StatusBadge';
import BrandButton from '../../components/ui/BrandButton';
import { Pagination } from '../../components/ui/BrandPrimitives';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import Modal from '../../components/owner/Modal';
import { actionLabel, auditOutcome, actorLabel, auditTime, entityType, affectedItem, areaLabel, auditRecordLink, errorDescription, errorSeverity, errorStatus, advancedAuditDetails, repeatedErrors, missingDataHelp } from '../../utils/auditPresentation.js';

const tabs = [
  ['activity', 'Activity', 'Who signed in, changed settings or performed administrative actions.'],
  ['errors', 'Errors', 'Problems detected by the system that may need attention.'],
  ['transactions', 'Transactions', 'Important business actions such as POS sales, orders, returns and refunds.'],
];
const filterNames = { actor: 'Performed by', action: 'Event type', entity: 'Affected area', result: 'Outcome' };
const Missing = ({ children }) => <span title={missingDataHelp[children]}>{children}</span>;

export default function MonitoringView({ initialTab = 'activity', title = 'Monitoring & logs' }) {
  const isAudit = title === 'Audit trail';
  const role = getCurrentAuthUser()?.role;
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ activity: [], errors: [], transactions: [], health: null });
  const [unavailable, setUnavailable] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState('');
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
    setUnavailable(tabs.filter((_, i) => results[i].status === 'rejected').map(([id]) => id));
    setError(results.some(item => item.status === 'rejected') ? 'Some information is unavailable. Refresh before relying on this view.' : '');
    setLoading(false);
  };
  useEffect(() => { void loadData(); }, []);
  const loadMoreActivity = async () => {
    setActivityPaging(current => ({ ...current, busy: true }));
    try {
      const next = await getActivityLogs({ limit: 100, page: activityPaging.page + 1 });
      const rows = Array.isArray(next) ? next : next?.logs || [];
      setData(current => ({ ...current, activity: [...new Map([...current.activity, ...rows].map(row => [row.id, row])).values()] }));
      setActivityPaging(current => ({ page: current.page + 1, total: Number(next?.total || current.total), busy: false }));
    } catch { setError('Older activity is unavailable. Please try again.'); setActivityPaging(current => ({ ...current, busy: false })); }
  };
  const logs = data[tab] || [];
  const options = useMemo(() => ({
    actor: [...new Set(logs.map(actorLabel))].sort(),
    action: [...new Set(logs.map(log => actionLabel(log, tab)))].sort(),
    entity: [...new Set(logs.map(log => entityType(log) ? areaLabel(entityType(log)) : affectedItem(log)))].sort(),
    result: [...new Set(logs.map(log => auditOutcome(log, tab).label))].sort(),
  }), [logs, tab]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return logs.filter(log => {
      const day = log.created_at ? new Date(log.created_at).toLocaleDateString('en-CA') : '';
      return (!term || [actionLabel(log, tab), actorLabel(log), affectedItem(log), log.action, log.error_type, log.id].some(value => String(value || '').toLowerCase().includes(term)))
        && (!filters.actor || actorLabel(log) === filters.actor)
        && (!filters.action || actionLabel(log, tab) === filters.action)
        && (!filters.entity || (entityType(log) ? areaLabel(entityType(log)) : affectedItem(log)) === filters.entity)
        && (!filters.result || auditOutcome(log, tab).label === filters.result)
        && (!filters.from || Boolean(day && day >= filters.from)) && (!filters.to || Boolean(day && day <= filters.to));
    });
  }, [logs, tab, query, filters]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  const rows = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const repeats = tab === 'errors' ? repeatedErrors(filtered) : [];
  const updateFilter = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const changeTab = id => { setTab(id); setSelected(null); setPage(1); setFilters({ actor: '', action: '', entity: '', result: '', from: '', to: '' }); setQuery(''); };
  const resultBadge = log => { const result = auditOutcome(log, tab); return <span title={missingDataHelp[result.label]}><StatusBadge tone={result.tone}>{result.label}</StatusBadge></span>; };
  const record = log => { const path = auditRecordLink(log, role); return path ? <Link to={path} className="font-medium text-orange-800 underline underline-offset-2">{affectedItem(log)}</Link> : <Missing>{affectedItem(log)}</Missing>; };
  const copyReference = async log => {
    try { await navigator.clipboard.writeText(JSON.stringify({ reference: advancedAuditDetails(log).reference, event: actionLabel(log, tab), timestamp: log.created_at || null })); setFeedback('Diagnostic reference copied. You can share it with support.'); }
    catch { setFeedback('The reference could not be copied. Check clipboard access and try again.'); }
  };
  return <div className="space-y-5">
    <PageHeader title={title} description={isAudit ? 'Understand who acted, what changed and whether anything needs attention. History is read only.' : 'Check availability and review problems that may need attention.'} actions={<BrandButton variant="secondary" onClick={loadData} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</BrandButton>} />
    {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {feedback && !selected && <p role="status" className="text-sm text-slate-700">{feedback}</p>}
    {!isAudit && <SectionCard title="System health" description={data.health?.timestamp ? `Last checked ${auditTime(data.health.timestamp)}. Availability and configuration checks do not send emails or create payments.` : 'Refresh to check availability and configuration.'} padded={false}>{loading ? <LoadingSkeleton className="h-48 w-full" /> : <ServiceHealth health={data.health} />}</SectionCard>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200"><div className="flex min-w-0 max-w-full gap-1 overflow-x-auto" role="group" aria-label="Log category">{tabs.map(([id, label, help]) => <button type="button" key={id} title={help} onClick={() => changeTab(id)} aria-pressed={tab === id} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${tab === id ? 'border-orange-600 text-slate-950' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>{label} <span className="ml-1 text-xs font-normal">{data[id].length}</span></button>)}</div><p className="ops-readonly-note pb-2"><ShieldCheck size={15} aria-hidden="true" />Read only</p></div>
    <p className="text-sm text-slate-600">{tabs.find(([id]) => id === tab)?.[2]}</p>
    <DataToolbar search={query} onSearchChange={event => { setQuery(event.target.value); setPage(1); }} searchPlaceholder="Search people, events or affected items…" label="Log filters">
      {Object.entries(filterNames).map(([key, label]) => <FilterSelect label={label} key={key} value={filters[key]} onChange={event => updateFilter(key, event.target.value)}><option value="">All</option>{options[key].map(value => <option key={value} value={value}>{value}</option>)}</FilterSelect>)}
      <label className="ops-filter-select"><span>Date from</span><input type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)} /></label><label className="ops-filter-select"><span>Date to</span><input type="date" min={filters.from || undefined} value={filters.to} onChange={event => updateFilter('to', event.target.value)} /></label>
    </DataToolbar>
    <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600"><summary className="cursor-pointer font-semibold">What missing information means</summary><dl className="mt-3 space-y-2">{Object.entries(missingDataHelp).map(([term, help]) => <div key={term}><dt className="font-medium text-slate-900">{term}</dt><dd>{help}</dd></div>)}</dl></details>
    {repeats.length > 0 && <SectionCard title="Repeated problems" description="Similar errors are grouped here. Every individual event remains in the list below.">{repeats.map(group => <div key={group[0].id} className="border-b border-slate-200 py-3 text-sm last:border-0"><p className="font-semibold">{actionLabel(group[0], 'errors')}</p><p className="mt-1 text-slate-600">Occurred {group.length} times between {auditTime(group.at(-1).created_at)} and {auditTime(group[0].created_at)}.</p><BrandButton variant="ghost" onClick={() => { setQuery(group[0].error_type || group[0].action); setPage(1); }}>View individual events</BrandButton></div>)}</SectionCard>}
    <SectionCard title={tabs.find(([id]) => id === tab)?.[1]} description={`${filtered.length} matching records in the loaded history.`} padded={false}>
      {loading ? <div className="space-y-2 p-4" role="status" aria-label="Loading audit events">{Array.from({ length: 5 }, (_, index) => <LoadingSkeleton key={index} className="h-12 w-full" />)}</div> : !rows.length ? <div className="p-6 text-sm text-slate-600"><p className="font-semibold text-slate-950">{unavailable.includes(tab) ? 'Records unavailable' : tab === 'errors' ? 'No errors found for this period.' : 'No matching activity found.'}</p><p className="mt-2">{unavailable.includes(tab) ? 'Refresh to retrieve this information.' : tab === 'errors' ? 'Your system has not recorded any matching problems.' : 'Try a different event type, person or date range.'}</p></div> : <>
        <div className="md:hidden">{rows.map((log, index) => <MobileDataCard key={log.id || index} title={actionLabel(log, tab)} reference={auditTime(log.created_at)} status={resultBadge(log)}><p className="mt-2 text-sm text-slate-700"><Missing>{actorLabel(log)}</Missing></p><p className="mt-2 break-words text-sm">{record(log)}</p>{tab === 'errors' && <p className="mt-2 text-sm text-slate-700">Severity: {errorSeverity(log)} · {errorStatus(log)}</p>}<BrandButton variant="ghost" onClick={() => setSelected(log)}>View details</BrandButton></MobileDataCard>)}</div>
        <div tabIndex={0} role="region" aria-label="Audit log table" className="hidden max-h-[620px] overflow-auto md:block"><table className="ops-audit-table w-full text-left"><thead><tr>{['When', 'Who', 'What happened', 'Affected item', 'Result', 'Details'].map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((log, index) => <tr key={log.id || index}><td className="whitespace-nowrap text-xs"><Missing>{auditTime(log.created_at)}</Missing></td><td><Missing>{actorLabel(log)}</Missing></td><td className="font-medium">{actionLabel(log, tab)}{tab === 'errors' && <p className="mt-1 text-xs font-normal text-slate-600">Severity: {errorSeverity(log)} · {errorStatus(log)}</p>}</td><td className="break-words">{record(log)}</td><td>{resultBadge(log)}</td><td><BrandButton variant="ghost" onClick={() => setSelected(log)}>View details</BrandButton></td></tr>)}</tbody></table></div>
      </>}
      {tab === 'activity' && data.activity.length < activityPaging.total && <div className="border-t border-slate-200 px-4 py-3"><BrandButton variant="secondary" disabled={activityPaging.busy} onClick={loadMoreActivity}>{activityPaging.busy ? 'Loading older activity…' : `Load older activity (${data.activity.length} of ${activityPaging.total} loaded)`}</BrandButton></div>}
      <div className="px-4"><Pagination page={currentPage} totalPages={Math.max(1, Math.ceil(filtered.length / 20))} onChange={setPage} /></div>
    </SectionCard>
    <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title="Event details" size="2xl">
      {selected && <div className="space-y-5 text-sm">
        {feedback && <p role="status" className="text-slate-700">{feedback}</p>}
        <div><p className="font-semibold">What happened</p><p className="mt-2 leading-6 text-slate-700">{tab === 'errors' ? errorDescription(selected) : `${actorLabel(selected)} — ${actionLabel(selected, tab)}${!missingDataHelp[affectedItem(selected)] ? `. ${affectedItem(selected)}.` : '.'}`}</p></div>
        <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-slate-600">When</dt><dd className="mt-1">{auditTime(selected.created_at)}</dd></div><div><dt className="text-slate-600">Result</dt><dd className="mt-1">{resultBadge(selected)}</dd></div><div><dt className="text-slate-600">Affected record</dt><dd className="mt-1 break-words">{record(selected)}</dd></div><div><dt className="text-slate-600">Performed by</dt><dd className="mt-1">{actorLabel(selected)}</dd></div><div><dt className="text-slate-600">Source</dt><dd className="mt-1">{selected.source ? 'Application' : 'Not captured'}</dd></div></dl>
        {tab === 'errors' && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><p>Severity: {errorSeverity(selected)} · Status: {errorStatus(selected)}</p><p>No automatic resolution is assumed. Check system health if this problem continues.</p><div className="flex flex-wrap gap-2"><BrandButton to="/superadmin/maintenance" variant="secondary">Check system health</BrandButton><BrandButton variant="secondary" onClick={() => { const day = selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-CA') : ''; changeTab('activity'); setFilters(current => ({ ...current, from: day, to: day })); }}>View related events</BrandButton><BrandButton variant="ghost" onClick={loadData}>Refresh</BrandButton><BrandButton variant="ghost" onClick={() => copyReference(selected)}>Copy diagnostic reference</BrandButton></div></div>}
        <details className="rounded-lg border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Advanced technical details</summary><p className="mb-3 text-xs text-slate-600">For system support. Credential values and private request bodies are excluded.</p><pre className="max-w-full whitespace-pre-wrap break-words text-xs leading-6 [overflow-wrap:anywhere]">{JSON.stringify(advancedAuditDetails(selected), null, 2)}</pre></details>
      </div>}
    </Modal>
  </div>;
}
