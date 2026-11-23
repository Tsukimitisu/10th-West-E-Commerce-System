import React from 'react';
import StatusBadge from '../ui/StatusBadge';

export default function ServiceHealth({ health }) {
  const integrations = { ...health?.integrations, ...health?.integrations?.oauth };
  const services = [
    { name: 'Website', ready: health ? health.status === 'available' : null, detail: health ? 'The shop application responded' : 'Availability check unavailable' },
    { name: 'Database', ready: health ? health.database === 'ok' : null, detail: health?.database === 'ok' ? 'Connection confirmed' : 'Connection not confirmed' },
    ...[['email', 'Email delivery'], ['paymongo', 'Payments'], ['shipping', 'Shipping rates'], ['waybill', 'Manual waybills'], ['tracking', 'Tracking'], ['google', 'Google sign-in'], ['facebook', 'Facebook sign-in']].map(([key, name]) => ({ name, ready: integrations[key]?.ready ?? null, configuration: true, detail: integrations[key]?.ready ? key === 'email' ? 'Configured; inbox delivery has not been tested' : key === 'paymongo' ? 'Configured; no test payment was created' : 'Required settings are available' : integrations[key] ? 'Check the service settings with your system administrator' : 'Check unavailable — please refresh' })),
  ];
  return <div aria-label="Service readiness">{services.map(service => <div key={service.name} className="ops-service-row"><strong>{service.name}</strong><small>{service.detail}</small><StatusBadge tone={service.ready === true ? service.configuration ? 'neutral' : 'success' : service.ready === false ? 'warning' : 'neutral'}>{service.ready === true ? service.configuration ? 'Configured' : 'Healthy' : service.ready === false ? 'Needs attention' : 'Unavailable'}</StatusBadge></div>)}</div>;
}
