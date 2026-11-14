import React from 'react';

const MetricCard = ({ icon: Icon, label, value, detail, onClick }) => {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`ops-metric w-full rounded-xl border border-slate-200 bg-white p-4 text-left ${
        onClick ? 'transition hover:border-slate-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 font-sans text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
        </div>
        {Icon && <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700`}><Icon size={19} aria-hidden="true" /></span>}
      </div>
    </Component>
  );
};

export default MetricCard;
