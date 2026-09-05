import React from 'react';
import { PackageOpen } from 'lucide-react';

const EmptyState = ({ icon: Icon = PackageOpen, title, description, action, className = '' }) => (
  <div className={`rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center ${className}`}>
    <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-white text-slate-500 shadow-sm">
      <Icon size={22} aria-hidden="true" />
    </span>
    <h3 className="font-display text-lg font-bold text-slate-950">{title}</h3>
    {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
