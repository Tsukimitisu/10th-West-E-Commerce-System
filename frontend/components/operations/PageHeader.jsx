import React from 'react';

// Callers may still pass `eyebrow`; it is intentionally ignored because the design
// system retires kicker labels above operations page titles.
const PageHeader = ({ title, description, actions, children }) => (
  <div className="ops-page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{title}</h1>
      {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
      {children}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export default PageHeader;
