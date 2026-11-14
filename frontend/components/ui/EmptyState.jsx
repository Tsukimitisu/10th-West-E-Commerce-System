import React from 'react';
import { AlertTriangle, PackageOpen } from 'lucide-react';

const EmptyState = ({ icon, title, description, action, tone = 'neutral', className = '' }) => {
  const isError = tone === 'error';
  const Icon = icon || (isError ? AlertTriangle : PackageOpen);
  return (
    <div
      role={isError ? 'alert' : undefined}
      className={`rounded-xl border border-dashed px-6 py-12 text-center ${isError ? 'border-red-200 bg-red-50/60' : 'border-slate-300 bg-slate-50'} ${className}`}
    >
      <span className={`mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-white shadow-sm ${isError ? 'text-red-600' : 'text-slate-500'}`}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 className="font-display text-lg font-bold text-slate-950">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
};

export default EmptyState;
