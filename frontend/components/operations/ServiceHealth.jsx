import React from 'react';
import StatusBadge from '../ui/StatusBadge';

export default function ServiceHealth({ health }) {
  const integrations = { ...health?.integrations, ...health?.integrations?.oauth };
  const services = [
    { name: 'Application API', ready: health ? health.status === 'available' : null, detail: health ? 'Administrative readiness endpoint' : 'Readiness request unavailable' },
    { name: 'Database', ready: health ? health.database === 'ok' : null, detail: health?.database === 'ok' ? 'Database query succeeded' : 'Connection not confirmed' },
    ...[['email', 'Email delivery'], ['paymongo', 'Payments'], ['shipping', 'Shipping rates'], ['waybill', 'Manual waybills'], ['tracking', 'Tracking'], ['google', 'Google OAuth'], ['facebook', 'Facebook OAuth']].map(([key, name]) => ({ name, ready: integrations[key]?.ready ?? null, detail: integrations[key] ? `${integrations[key].provider || key} · ${String(integrations[key].status || 'Not reported').replaceAll('_', ' ')}` : 'Not reported by readiness endpoint' })),
  ];
  return <div aria-label="Service readiness">{services.map(service => <div key={service.name} className="ops-service-row"><strong>{service.name}</strong><small>{service.detail}</small><StatusBadge tone={service.ready === true ? 'success' : service.ready === false ? 'warning' : 'neutral'}>{service.ready === true ? 'Ready' : service.ready === false ? 'Needs attention' : 'Unknown'}</StatusBadge></div>)}</div>;
}
