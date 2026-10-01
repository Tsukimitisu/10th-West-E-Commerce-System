import React from 'react';

const tones = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-orange-50 text-orange-700',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

const MetricCard = ({ icon: Icon, label, value, detail, tone = 'neutral', onClick }) => {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm ${
        onClick ? 'transition hover:border-slate-300 hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
        </div>
        {Icon && <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tones[tone] || tones.neutral}`}><Icon size={19} /></span>}
      </div>
    </Component>
  );
};

export default MetricCard;
