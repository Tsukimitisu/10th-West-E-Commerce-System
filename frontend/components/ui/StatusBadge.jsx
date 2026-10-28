import React from 'react';

const tones = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-slate-200 bg-slate-100 text-slate-800',
  brand: 'border-orange-200 bg-orange-50 text-orange-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
};

const StatusBadge = ({ tone = 'neutral', dot = false, icon: Icon, children, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone] || tones.neutral} ${className}`}>
    {Icon ? <Icon size={12} aria-hidden="true" /> : dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
    {children}
  </span>
);

export default StatusBadge;
