import React from 'react';

const ChartCard = ({ title, subtitle, action, children, className = '' }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="font-display text-sm font-semibold text-slate-950">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export default ChartCard;


